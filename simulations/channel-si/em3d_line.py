"""PCB extraction with separate feed fixtures and line reference planes.

The source resistor gaps are outside the measured DUT. Voltage is measured
at each trace reference plane. Two surrounding current planes remove the
first-order spatial offset of the staggered FDTD grid.
"""
from pathlib import Path
import argparse,hashlib,json
import numpy as np
from shapely.geometry import LineString,box
from CSXCAD import ContinuousStructure
from openEMS import openEMS
from openEMS.ports import UI_data
import em3d as base

T=np.array([[1,-1,0,0],[0,0,1,-1],[1,1,0,0],[0,0,1,1]])/np.sqrt(2)

def index(lines,value):return int(np.argmin(abs(lines-value)))
def span(lines,low,high):
    # Enclose the physical conductor, independently of voltage-path snapping.
    lo=int(np.searchsorted(lines,low+1e-9,side='right')-1)
    hi=int(np.searchsorted(lines,high-1e-9,side='left'))
    return ((lines[lo-1]+lines[lo])/2+1e-6,
            (lines[hi]+lines[hi+1])/2-1e-6,lo-1,hi)

def add_feed(fdtd,csx,mesh,number,spec,amplitude,robust=False):
    x,y,w,z,gnd=spec
    xg,yg,zg=[mesh.GetLines(a,do_sort=True) for a in ['x','y','z']]
    ix,iy,iz=index(xg,x),index(yg,y),index(zg,z)
    assert 8<ix<len(xg)-9 and 8<iy<len(yg)-9, 'Feed overlaps lateral PML cells'
    x,y,z=float(xg[ix]),float(yg[iy]),float(zg[iz])
    gnd=float(zg[index(zg,gnd)])
    candidates=zg[(zg>min(z,gnd)+1e-9)&(zg<max(z,gnd)-1e-9)]
    gap=float(candidates[index(candidates,z)])
    post=csx.AddMetal(f'feed_return_post_{number}')
    # A tiny finite cross section avoids a degenerate XY bounding box.
    # It still occupies only the same single vertical Yee edge.
    radius=1e-6 if robust else 0
    post.AddBox([x-radius,y-radius,gnd],[x+radius,y+radius,gap],priority=120)
    port=fdtd.AddLumpedPort(number,42.5,[x,y,gap],[x,y,z],'z',excite=amplitude,priority=150)
    probe=csx.GetPropertiesByName(port.I_filenames[0])[0].GetPrimitive(0)
    probe.SetStart([(xg[ix-1]+xg[ix])/2+1e-6,(yg[iy-1]+yg[iy])/2+1e-6,(z+gap)/2])
    probe.SetStop([(xg[ix]+xg[ix+1])/2-1e-6,(yg[iy]+yg[iy+1])/2-1e-6,(z+gap)/2])
    kz=min(index(zg,z),index(zg,gap))
    return port,{'start':[x,y,gap],'stop':[x,y,z],
                 'expectedCurrentIndices':[[ix-1,iy-1,kz],[ix,iy,kz]],
                 'lateralPMLCellClearance':[ix-8,len(xg)-9-ix,iy-8,len(yg)-9-iy]}

def add_measurement(csx,mesh,number,spec):
    x,y,w,z,gnd=spec
    physical_y=y
    xg,yg,zg=[mesh.GetLines(a,do_sort=True) for a in ['x','y','z']]
    ix=index(xg,x);x=float(xg[ix]);y=float(yg[index(yg,y)])
    z=float(zg[index(zg,z)]);gnd=float(zg[index(zg,gnd)])
    voltage=f'line_ut_{number}'
    csx.AddProbe(voltage,p_type=0,weight=-1).AddBox([x,y,gnd],[x,y,z])
    yl,yh,jl,jh=span(yg,physical_y-w/2,physical_y+w/2)
    copper_low,copper_high=(z,z+base.T) if z>gnd else (z-base.T,z)
    zl,zh,kl,kh=span(zg,copper_low,copper_high)
    current=[];expected=[]
    for suffix,kx in [('A',ix-1),('B',ix)]:
        xx=(xg[kx]+xg[kx+1])/2
        name=f'line_it_{number}{suffix}'
        csx.AddProbe(name,p_type=1,weight=1 if number<=2 else -1,norm_dir=0).AddBox([xx,yl,zl],[xx,yh,zh])
        current.append(name);expected.append([[kx,jl,kl],[kx,jh,kh]])
    left=x-xg[ix-1];right=xg[ix+1]-x
    return {'voltageFilename':voltage,'currentFilenames':current,
        'currentWeights':[float(right/(left+right)),float(left/(left+right))],
        'expectedCurrentIndices':expected,'reference':[x,y,w,z,gnd]}

def run(args):
    geometry=None
    if getattr(args,'handoff_file',None):
        import batch_geometry
        if not getattr(args,'plan_file',None):raise ValueError('Explicit handoff requires --plan-file for SHA256 binding')
        plan_metadata=json.loads(Path(args.plan_file).resolve().read_text())
        handoff,geometry=batch_geometry.load_handoff(args,plan_metadata=plan_metadata)
        if args.case=='control' and any(abs(d['thicknessMm']-getattr(args,'control_height_mm',base.H))>1e-12 for d in [geometry['stackup']['dielectrics'][0],geometry['stackup']['dielectrics'][-1]]):
            raise ValueError('Control height does not match handoff outer dielectric thickness')
        args._validated_handoff=(handoff,geometry)
    name=f'{args.case}-{args.channel}-{args.resolution:g}-{args.length:g}-{args.excitation}'
    dest=(Path(args.output_root).resolve()/name if args.output_root else base.OUT/'iterations'/args.variant/name);dest.mkdir(parents=True,exist_ok=True)
    fdtd=openEMS(NrTS=args.steps,EndCriteria=args.end_criteria)
    fdtd.SetTimeStepFactor(.8);fdtd.SetGaussExcite(8e9,8e9)
    fdtd.SetBoundaryCond(['PML_8']*6 if args.case=='board' else ['PML_8']*4+['PEC','PML_8'])
    csx=ContinuousStructure();fdtd.SetCSX(csx);mesh=csx.GetGrid();mesh.SetDeltaUnit(.001)
    refs,meta=(base.setup_board(fdtd,csx,mesh,args.resolution,args.channel,args) if args.case=='board' else
               base.setup_control(fdtd,csx,mesh,args.resolution,args.length,args))
    feeds=[];extension=csx.AddMetal('measurement_feed_extensions')
    if args.case=='board':
        if geometry is None:geometry=json.loads((base.ROOT/'dist/si-channel-review/field-solver-handoff.json').read_text())
        ch=next(c for c in geometry['channels'] if c['name']==args.channel)
        target={c['stages'][0]['traceId'] for c in ch['conductors']}
        existing=base.copper_objects(geometry['boardContext'])
    mask=csx.AddMaterial('feed_extension_mask',epsilon=3.8)
    for i,(x,y,w,z,gnd) in enumerate(refs):
        feed_x=round(x+(-1 if i<2 else 1)*args.feed_shift,9)
        shape=LineString([(x,y),(feed_x,y)]).buffer(w/2,cap_style=2)
        layer='top' if z>gnd else 'bottom'
        if args.case=='board':
            conductor=ch['conductors'][i%2]
            esd_ports={p['pcb_port_id'] for p in conductor['components'][0]['signalPads']}
            downstream=conductor['stages'][1]['traceId']
            for obj in existing:
                if layer not in obj['layers'] or obj.get('trace') in target and obj['label']==obj['trace']:continue
                # The output feed reconnects the same conductor's exported
                # ESD signal pad and next trace, outside the measured DUT.
                if i>=2 and (obj.get('port') in esd_ports or obj.get('trace')==downstream):continue
                assert shape.intersection(obj['shape']).area<1e-8, f"Feed extension overlaps {obj['label']}"
            prop=csx.GetPropertyByCoordPriority([feed_x,y,gnd-.0076])
            assert prop and prop.GetName()=='exported_copper_PEC','Feed return lies in a ground aperture'
        low,high=(z,z+base.T) if z>gnd else (z-base.T,z)
        if args.case=='control':
            # Preserve the benchmark's tapered cross section through the
            # feeds. A rectangular extension would create a width step at
            # the reference plane and invalidate the uniform-line check.
            for part in range(2):
                width=w-.01778*(part+.5)/2
                lower=round(y-width/2,9) if args.graded_control else y-width/2
                upper=round(y+width/2,9) if args.graded_control else y+width/2
                extension.AddBox([min(x,feed_x),lower,z+part*base.T/2],
                                 [max(x,feed_x),upper,z+(part+1)*base.T/2],priority=10)
            mask.AddBox([min(x,feed_x),y-w/2,z],[max(x,feed_x),y+w/2,z+base.T+.01524],priority=3)
        else:
            extension.AddBox([min(x,feed_x),y-w/2,low],[max(x,feed_x),y+w/2,high],priority=10)
            mask_low=high if z>gnd else low-.01524
            mask.AddBox([min(x,feed_x),y-w/2,mask_low],[max(x,feed_x),y+w/2,mask_low+.01524],priority=3)
        mesh.AddLine('x',[feed_x,x]);feeds.append((feed_x,y,w,z,gnd))
    active={'d1':[1,-1,0,0],'d2':[0,0,1,-1],'c1':[1,1,0,0],'c2':[0,0,1,1]}[args.excitation]
    ports=[];gaps=[];measurements=[]
    for i,(ref,feed) in enumerate(zip(refs,feeds),1):
        if args.fixed_feed_gap_mm:
            from fixed_feed import add_feed as fixed_add_feed
            port,gap=fixed_add_feed(fdtd,csx,mesh,i,feed,active[i-1],args.fixed_feed_gap_mm)
        else:port,gap=add_feed(fdtd,csx,mesh,i,feed,active[i-1],args.robust_feed_posts)
        ports.append(port);gaps.append(gap)
        measurements.append(add_measurement(csx,mesh,i,ref))
    source=Path(__file__).read_bytes();base_source=Path(base.__file__).read_bytes()
    meta.update({'meshLines':{a:len(mesh.GetLines(a)) for a in ['x','y','z']},
        'resolutionMm':args.resolution,'excitation':args.excitation,'ports':refs,'feedPorts':feeds,
        'portStyle':'edge','measurementStyle':'line','lineMeasurement':measurements,
        'terminalGaps':gaps,'feedShiftMm':args.feed_shift,'maximumTimeSteps':args.steps,
        'robustFeedPosts':args.robust_feed_posts,
        'endCriteria':args.end_criteria,
        'scriptSha256':hashlib.sha256(source).hexdigest(),'baseSourceSha256':hashlib.sha256(base_source).hexdigest(),
        'cpuThreads':getattr(args,'cpu_threads',8)})
    if getattr(args,'handoff_file',None):
        meta.update({'sourceSha256':geometry['sourceSha256'],'handoffFile':str(handoff),
            'handoffSha256':hashlib.sha256(handoff.read_bytes()).hexdigest(),'stackupCode':geometry['stackup']['code']})
    (dest/'setup.json').write_text(json.dumps(meta,indent=2)+'\n')
    (dest/'driver-source.py').write_bytes(source);(dest/'base-driver-source.py').write_bytes(base_source)
    if args.fixed_feed_gap_mm:(dest/'fixed-feed-source.py').write_bytes(Path(__file__).with_name('fixed_feed.py').read_bytes())
    (dest/'ABORT').unlink(missing_ok=True)
    (dest/'status.json').write_text(json.dumps({'state':'running','scriptSha256':meta['scriptSha256']}))
    fdtd.Write2XML(str(dest/'model.xml'))
    if args.setup_only:
        (dest/'status.json').write_text(json.dumps({'state':'setup-only','scriptSha256':meta['scriptSha256']}))
        print(json.dumps({'directory':str(dest),'state':'setup-only'}));return
    result=fdtd.Run(str(dest),cleanup=True,numThreads=getattr(args,'cpu_threads',8),engine=args.engine,
                    dump_statistics=True,showProbeDiscretization=True)
    if result not in [None,0]:raise RuntimeError(str(result))
    for p in ports:p.CalcPort(str(dest),base.F,ref_impedance=42.5)
    np.savez_compressed(dest/'feed-waves.npz',frequency=base.F,
        a=np.array([p.uf_inc for p in ports]).T,b=np.array([p.uf_ref for p in ports]).T)
    u=[];current=[]
    for spec in measurements:
        u.append(UI_data([spec['voltageFilename']],str(dest),base.F).ui_f_val[0])
        values=UI_data(spec['currentFilenames'],str(dest),base.F).ui_f_val
        current.append(sum(weight*v for weight,v in zip(spec['currentWeights'],values)))
    a=(np.array(u).T+42.5*np.array(current).T)/2;b=(np.array(u).T-42.5*np.array(current).T)/2
    am=a@T.T;bm=b@T.T;k={'d1':0,'d2':1,'c1':2,'c2':3}[args.excitation]
    np.savez_compressed(dest/'waves.npz',frequency=base.F,a=a,b=b,am=am,bm=bm,response=bm/am[:,k,None])
    (dest/'status.json').write_text(json.dumps({'state':'completed','qualified':False,'scriptSha256':meta['scriptSha256']}))
    print(json.dumps({'directory':str(dest),'mesh':meta['meshLines'],'measurementStyle':'line'}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--case',choices=['board','control'],default='board')
    p.add_argument('--channel',default='USB4_RX2');p.add_argument('--variant',default='line-continued')
    p.add_argument('--resolution',type=float,default=.04);p.add_argument('--length',type=float,default=3)
    p.add_argument('--excitation',choices=['d1','d2','c1','c2'],default='d1')
    p.add_argument('--port-style',default='edge');p.add_argument('--boundary',default='continued')
    p.add_argument('--crop-margin',type=float,default=0);p.add_argument('--padding',type=float,default=1.5)
    p.add_argument('--air-height',type=float,default=1.6);p.add_argument('--z-refinement',type=float,default=1)
    p.add_argument('--feed-shift',type=float,default=.4);p.add_argument('--steps',type=int,default=180000)
    p.add_argument('--align-control-edges',action='store_true')
    p.add_argument('--graded-control',action='store_true')
    p.add_argument('--robust-feed-posts',action='store_true')
    p.add_argument('--control-edge-thirds',action='store_true')
    p.add_argument('--end-criteria',type=float,default=1e-5)
    p.add_argument('--output-root');p.add_argument('--fixed-feed-gap-mm',type=float,default=0)
    p.add_argument('--handoff-file');p.add_argument('--plan-file')
    p.add_argument('--control-height-mm',type=float,default=.0994)
    p.add_argument('--cpu-threads',type=int,default=8)
    p.add_argument('--engine',default='gpu');p.add_argument('--setup-only',action='store_true');run(p.parse_args())
