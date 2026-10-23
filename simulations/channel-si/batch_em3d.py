"""Four-port local extraction for every planned USB4 and PCIe fixture."""
from pathlib import Path
import argparse,hashlib,json
import numpy as np
from CSXCAD import ContinuousStructure
from openEMS import openEMS
from openEMS.ports import UI_data
import em3d as base
import em3d_line as line
import batch_geometry

OUT=base.ROOT/'dist/si-channel-review/all-channels'
T=line.T

def measurement(csx,mesh,number,p):
    axes=[mesh.GetLines(a,do_sort=True) for a in ['x','y','z']]
    axis=p['axis'];normal=1-axis;xy=p['xy'];ia=line.index(axes[axis],xy[axis]);other=float(axes[normal][line.index(axes[normal],xy[normal])])
    point=[0.,0.];point[axis]=float(axes[axis][ia]);point[normal]=other
    z=float(axes[2][line.index(axes[2],p['z'])]);gnd=float(axes[2][line.index(axes[2],p['groundZ'])])
    voltage=f'line_ut_{number}';csx.AddProbe(voltage,p_type=0,weight=-1).AddBox([*point,gnd],[*point,z])
    tl,th,jl,jh=line.span(axes[normal],xy[normal]-p['widthMm']/2,xy[normal]+p['widthMm']/2)
    cl,ch=(z,z+base.T) if z>gnd else (z-base.T,z)
    zl,zh,kl,kh=line.span(axes[2],cl,ch);names=[];expected=[]
    for suffix,k in [('A',ia-1),('B',ia)]:
        value=(axes[axis][k]+axes[axis][k+1])/2;start=[0.,0.,zl];stop=[0.,0.,zh]
        start[axis]=stop[axis]=value;start[normal]=tl;stop[normal]=th
        name=f'line_it_{number}{suffix}';csx.AddProbe(name,p_type=1,weight=p['incomingSign'],norm_dir=axis).AddBox(start,stop)
        low=[0,0,kl];high=[0,0,kh];low[axis]=high[axis]=k;low[normal]=jl;high[normal]=jh
        expected.append([low,high]);names.append(name)
    left=point[axis]-axes[axis][ia-1];right=axes[axis][ia+1]-point[axis]
    return {'voltageFilename':voltage,'currentFilenames':names,'currentWeights':[float(right/(left+right)),float(left/(left+right))],
        'expectedCurrentIndices':expected,'reference':[*point,p['widthMm'],z,gnd],'axis':axis,'incomingSign':p['incomingSign']}

def run(args):
    root=Path(args.output_root).resolve() if args.output_root else OUT
    plans=json.loads((Path(args.plan_file).resolve() if args.plan_file else OUT/'plan.json').read_text());plan=next(p for p in plans['plans'] if p['channel']==args.channel)
    assert plan['supported'],plan
    dest=root/args.suite/f'board-{args.channel}-{args.resolution:g}-3-{args.excitation}';dest.mkdir(parents=True,exist_ok=True)
    fdtd=openEMS(NrTS=args.steps,EndCriteria=args.end_criteria);fdtd.SetTimeStepFactor(.8)
    fdtd.SetGaussExcite(8e9,8e9);fdtd.SetBoundaryCond(['PML_8']*6)
    csx=ContinuousStructure();fdtd.SetCSX(csx);mesh=csx.GetGrid();mesh.SetDeltaUnit(.001)
    ports,meta=batch_geometry.setup(fdtd,csx,mesh,args,plan,plans)
    if args.open_pads:
        from shapely.geometry import box
        _,geometry=batch_geometry.load_handoff(args,plan,plans)
        exposed={e['pcb_port_id'] for e in geometry['boardContext'] if e['type']=='pcb_smtpad' and e.get('is_covered_with_solder_mask') is False and e.get('pcb_port_id') is not None}
        aperture=csx.AddMaterial('explicit_exposed_pad_air',epsilon=1);crop=box(*meta['boundsMm']);count=0;checks=[]
        for obj in base.copper_objects(geometry['boardContext']):
            if obj['port'] not in exposed or not obj['shape'].intersects(crop):continue
            layer=obj['layers'][0]
            if layer not in ['top','bottom']:continue
            # Open the coating above copper, keeping the conductor itself
            # intact even when nested copper islands have higher priority.
            z=(base.T+1e-6 if layer=='top' else meta['layerZMm']['bottom']-base.T-.01524) if args.feature_mesh else (0 if layer=='top' else meta['layerZMm']['bottom']-base.T-.01524)
            opening=base.continue_boundary(obj['shape'].intersection(crop),meta['boundsMm'],args.padding).intersection(batch_geometry.board_outline(geometry))
            for polygon in base.polygons(opening):
                base.add_polygon(aperture,polygon,z,.01524-1e-6 if args.feature_mesh else base.T+.01524,priority=500 if args.feature_mesh else 5);count+=1
                point=polygon.representative_point();height=base.T+.0075 if layer=='top' else meta['layerZMm']['bottom']-base.T-.0075
                prop=csx.GetPropertyByCoordPriority([point.x,point.y,height]);assert prop and prop.GetName()=='explicit_exposed_pad_air',(obj['port'],layer,point.x,point.y,height,prop.GetName() if prop else None)
                checks.append({'pcbPortId':obj['port'],'layer':layer,'passed':True})
        meta['exposedPadMaskOpenings']=count
        meta['maskOpeningChecks']=checks
    active={'d1':[1,-1,0,0],'d2':[0,0,1,-1],'c1':[1,1,0,0],'c2':[0,0,1,1]}[args.excitation]
    gaps=[];sources=[];measurements=[]
    for n,p in enumerate(ports,1):
        feed=[*p['feedXY'],p['widthMm'],p['z'],p['groundZ']]
        if args.fixed_feed_gap_mm:
            from fixed_feed import add_feed
            source,gap=add_feed(fdtd,csx,mesh,n,feed,active[n-1],args.fixed_feed_gap_mm)
        else:source,gap=line.add_feed(fdtd,csx,mesh,n,feed,active[n-1],robust=True)
        sources.append(source);gaps.append(gap);measurements.append(measurement(csx,mesh,n,p))
    driver=Path(__file__).read_bytes();geom=Path(batch_geometry.__file__).read_bytes()
    meta.update({'meshLines':{a:len(mesh.GetLines(a)) for a in ['x','y','z']},'resolutionMm':args.resolution,
        'excitation':args.excitation,'ports':ports,'portStyle':'edge','measurementStyle':'line',
        'lineMeasurement':measurements,'terminalGaps':gaps,'maximumTimeSteps':args.steps,'endCriteria':args.end_criteria,
        'scriptSha256':hashlib.sha256(driver).hexdigest(),'baseSourceSha256':hashlib.sha256(geom).hexdigest(),
        'runArguments':vars(args),'cpuThreads':getattr(args,'cpu_threads',8)})
    (dest/'setup.json').write_text(json.dumps(meta,indent=2)+'\n');(dest/'driver-source.py').write_bytes(driver)
    (dest/'base-driver-source.py').write_bytes(geom)
    for module,name in [(base,'em3d-source.py'),(line,'em3d-line-source.py')]:
        (dest/name).write_bytes(Path(module.__file__).read_bytes())
    if args.fixed_feed_gap_mm:(dest/'fixed-feed-source.py').write_bytes(Path(__file__).with_name('fixed_feed.py').read_bytes())
    if args.feature_mesh:(dest/'feature-mesh-source.py').write_bytes(Path(__file__).with_name('feature_mesh.py').read_bytes())
    fdtd.Write2XML(str(dest/'model.xml'))
    if args.setup_only:
        (dest/'status.json').write_text(json.dumps({'state':'setup-only'}));print(json.dumps({'directory':str(dest),'state':'setup-only','mesh':meta['meshLines']}));return
    (dest/'ABORT').unlink(missing_ok=True);(dest/'status.json').write_text(json.dumps({'state':'running'}))
    result=fdtd.Run(str(dest),cleanup=True,numThreads=getattr(args,'cpu_threads',8),engine='gpu',dump_statistics=True,showProbeDiscretization=True)
    if result not in [0,None]:raise RuntimeError(str(result))
    for p in sources:p.CalcPort(str(dest),base.F,ref_impedance=42.5)
    np.savez_compressed(dest/'feed-waves.npz',frequency=base.F,a=np.array([p.uf_inc for p in sources]).T,b=np.array([p.uf_ref for p in sources]).T)
    voltage=[];current=[]
    for p in measurements:
        voltage.append(UI_data([p['voltageFilename']],str(dest),base.F).ui_f_val[0])
        values=UI_data(p['currentFilenames'],str(dest),base.F).ui_f_val
        current.append(sum(w*v for w,v in zip(p['currentWeights'],values)))
    a=(np.array(voltage).T+42.5*np.array(current).T)/2;b=(np.array(voltage).T-42.5*np.array(current).T)/2
    am=a@T.T;bm=b@T.T;k=['d1','d2','c1','c2'].index(args.excitation)
    np.savez_compressed(dest/'waves.npz',frequency=base.F,a=a,b=b,am=am,bm=bm,response=bm/am[:,k,None])
    (dest/'status.json').write_text(json.dumps({'state':'completed','qualified':False}))
    print(json.dumps({'directory':str(dest),'mesh':meta['meshLines']}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--channel',required=True);p.add_argument('--suite',default='coarse')
    p.add_argument('--resolution',type=float,default=.04);p.add_argument('--excitation',choices=['d1','d2','c1','c2'],default='d1')
    p.add_argument('--crop-margin',type=float,default=0);p.add_argument('--padding',type=float,default=1.5)
    p.add_argument('--air-height',type=float,default=1.6);p.add_argument('--z-refinement',type=float,default=1)
    p.add_argument('--end-criteria',type=float,default=1e-10);p.add_argument('--steps',type=int,default=300000)
    p.add_argument('--open-pads',action='store_true')
    p.add_argument('--output-root');p.add_argument('--plan-file')
    p.add_argument('--handoff-file');p.add_argument('--cpu-threads',type=int,default=8)
    p.add_argument('--fixed-feed-gap-mm',type=float,default=0)
    p.add_argument('--feature-mesh',action='store_true');p.add_argument('--barrel-step-mm',type=float,default=.01)
    p.add_argument('--resolve-lands',action='store_true')
    p.add_argument('--setup-only',action='store_true');run(p.parse_args())
