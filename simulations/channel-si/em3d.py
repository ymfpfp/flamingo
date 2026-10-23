"""Reproducible openEMS experiments. Embedded PCB ports, not link compliance.

The control uses the same copper/mask geometry as the independent 2D solver.
Board experiments preserve exported copper and plane apertures inside a crop.
PEC copper isolates reflection/return-path effects; attenuation is not qualified.
"""
from pathlib import Path
import argparse
import hashlib
import json
import sys
import os
import numpy as np
from shapely.geometry import Polygon, Point, LineString, box
from shapely.ops import unary_union
from shapely import constrained_delaunay_triangles
from CSXCAD import ContinuousStructure
from openEMS import openEMS

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'dist/si-channel-review/em3d'
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from copper_geometry import copper_objects

H = .0994
T = .04064
GAP = .1001
W = .1234
C0 = 299792458.
F = np.linspace(.25e9, 16e9, 253)

def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for child in g.geoms for p in polygons(child)]

def add_polygon(prop, poly, z, thickness=0, priority=10, hole_prop=None):
    # Higher-priority dielectric holes avoid thousands of broad triangles.
    parts = ([Polygon(poly.exterior)] if hole_prop else
             list(constrained_delaunay_triangles(poly).geoms)
             if len(poly.interiors) else [poly])
    for p in parts:
        xy = np.asarray(p.exterior.coords)[:-1].T
        if thickness:
            prop.AddLinPoly(points=xy, norm_dir=2, elevation=z,
                            length=thickness, priority=priority)
        else:
            prop.AddPolygon(points=xy, norm_dir=2, elevation=z, priority=priority)
    if hole_prop:
        for ring in poly.interiors:
            add_polygon(hole_prop,Polygon(ring),z,thickness,priority+10)

def grid_axis(lo, hi, step, anchors=()):
    # Insert required port/interface lines without creating sliver cells.
    values = list(np.arange(lo, hi + step*.1, step)) + [lo, hi]
    for a in anchors:
        values = [v for v in values if abs(v-a) > step*.35]
        values.append(a)
    return np.unique(np.round(values, 9))

def linear_parts(shape):
    if shape.is_empty:return []
    if shape.geom_type=='LineString':return [shape]
    return [p for g in getattr(shape,'geoms',[]) for p in linear_parts(g)]

def continue_boundary(shape,bounds,padding):
    """Continue the edge cross section unchanged through the lateral PML.

    This represents a locally extended board, not the real remote board edge.
    It avoids creating a reflective laminate/copper edge at the extraction cut.
    """
    xl,yl,xh,yh=bounds;parts=[shape]
    for x,outside in [(xl,xl-padding),(xh,xh+padding)]:
        for line in linear_parts(shape.intersection(LineString([(x,yl),(x,yh)]))):
            lo,hi=line.bounds[1],line.bounds[3]
            if hi>lo:parts.append(box(min(x,outside),lo,max(x,outside),hi))
    for y,outside in [(yl,yl-padding),(yh,yh+padding)]:
        for line in linear_parts(shape.intersection(LineString([(xl,y),(xh,y)]))):
            lo,hi=line.bounds[0],line.bounds[2]
            if hi>lo:parts.append(box(lo,min(y,outside),hi,max(y,outside)))
    for x,ox in [(xl,xl-padding),(xh,xh+padding)]:
        for y,oy in [(yl,yl-padding),(yh,yh+padding)]:
            if shape.covers(Point(x,y)):parts.append(box(min(x,ox),min(y,oy),max(x,ox),max(y,oy)))
    return unary_union(parts)

def setup_control(fdtd, csx, mesh, resolution, length, options=None):
    # Stepped mask and two slices of trapezoidal copper. Compare against 2D.
    height=float(getattr(options,'control_height_mm',H))
    if not np.isfinite(height) or height<=0:raise ValueError('Control height must be positive and finite')
    graded=bool(options and getattr(options,'graded_control',False))
    # Keep both source fixtures beyond all eight lateral PML cells even
    # when the longitudinal mesh is coarsened to 0.1 mm.
    xlo, xhi = (-1.6, length+1.6) if graded else (-1., length+1.)
    ylo, yhi = -1.2, 1.2
    zlo, zhi = -height, 1.6
    mesh.AddLine('x', grid_axis(xlo, xhi, .1 if graded else .05, [0, length]))
    edges = [-GAP/2-W, -GAP/2, GAP/2, GAP/2+W]
    if options and getattr(options,'align_control_edges',False):
        for center in [-(GAP+W)/2,(GAP+W)/2]:
            edges.append(center)
            for k in range(2):
                width=W-.01778*(k+.5)/2
                edges.extend([center-width/2,center+width/2])
    if graded:
        from cross_section import axis
        if getattr(options,'control_edge_thirds',False):
            # Match openEMS automesh.mesh_hint_from_box's metal-edge rule:
            # one third of a cell inside, two thirds outside the conductor.
            edges=[0.,-(GAP+W)/2,(GAP+W)/2]
            for center in [-(GAP+W)/2,(GAP+W)/2]:
                for k in range(2):
                    width=W-.01778*(k+.5)/2
                    lower,upper=center-width/2,center+width/2
                    edges.extend([lower+resolution/3,lower-2*resolution/3,
                                  upper-resolution/3,upper+2*resolution/3])
        positive=axis([round(abs(v),9) for v in edges],.30,1.2,resolution)
        refined=[]
        for lo,hi in zip(positive[:-1],positive[1:]):
            refined.extend(np.linspace(lo,hi,int(np.ceil((hi-lo)/.03))+1)[:-1])
        positive=np.round(np.r_[refined,positive[-1]],12)
        mesh.AddLine('y',np.unique(np.r_[-positive,positive]))
    else:mesh.AddLine('y', grid_axis(ylo, yhi, resolution, edges+[0]))
    z_count=(int(np.ceil(8*getattr(options,'z_refinement',1)))+1) if options and options.port_style=='edge' else 11
    mesh.AddLine('z', np.r_[np.linspace(-height, 0, z_count),
                          [T/2, .03048, T, T+.01524], np.arange(.1,1.6001,.1)])
    gap=float(getattr(options,'fixed_feed_gap_mm',0))
    if gap:
        if not 0<gap<height:raise ValueError('Fixed feed gap must lie inside control dielectric')
        if np.min(abs(mesh.GetLines('z')+gap))>1e-10:mesh.AddLine('z',[-gap])
    substrate = csx.AddMaterial('prepreg', epsilon=4.1)
    substrate.AddBox([xlo,ylo,-height],[xhi,yhi,0],priority=1)
    mask = csx.AddMaterial('mask', epsilon=3.8)
    mask.AddBox([xlo,ylo,0],[xhi,yhi,.03048],priority=2)
    pec=csx.AddMetal('copper_PEC')
    pec.AddBox([xlo,ylo,-height],[xhi,yhi,-height],priority=10)
    centers=[-(GAP+W)/2,(GAP+W)/2]
    for y in centers:
        mask.AddBox([0,y-W/2,0],[length,y+W/2,T+.01524],priority=3)
        for k in range(2):
            width=W-.01778*(k+.5)/2
            low=round(y-width/2,9) if graded else y-width/2
            high=round(y+width/2,9) if graded else y+width/2
            pec.AddBox([0,low,k*T/2],[length,high,(k+1)*T/2],priority=10)
    specs=[(0,centers[0],W,0,-height),(0,centers[1],W,0,-height),
           (length,centers[0],W,0,-height),(length,centers[1],W,0,-height)]
    return specs, {'type':'uniform-pair-control','lengthMm':length,
                   'controlHeightMm':height,
                   'referenceZdiffOhm':87.120749 if height==H else None,'referenceEeff':2.9704453 if height==H else None,
                   'controlMesh':'symmetric fine core and graded exterior' if graded else 'uniform transverse grid',
                   'copper':'PEC, two-step trapezoid','portType':'embedded vertical lumped'}

def setup_board(fdtd, csx, mesh, resolution, channel, options=None):
    if getattr(options,'handoff_file',None):
        if not hasattr(options,'_validated_handoff'):raise ValueError('Explicit handoff must be validated against its plan first')
        source,g=options._validated_handoff
    else:
        source=ROOT/'dist/si-channel-review/field-solver-handoff.json'
        g=json.loads(source.read_text())
    assert hashlib.sha256((ROOT/g['sourceFile']).read_bytes()).hexdigest()==g['sourceSha256']
    ch=next(c for c in g['channels'] if c['name']==channel)
    stages=[c['stages'][0] for c in ch['conductors']]
    if channel!='USB4_RX2':raise ValueError('Local return fixture currently supports USB4_RX2 only')
    # Keep the exact last via pair and fanout, cut at straight surface traces.
    input_x,output_x=38.5,40.3
    margin=options.crop_margin if options else 0
    padding=options.padding if options else 1.5
    continued=bool(options and options.boundary=='continued')
    bounds=[36.9-margin,102.0-margin,41.9+margin,106.7+margin]
    crop=box(*bounds)
    xlo,ylo,xhi,yhi=bounds
    layerz={'top':0.}
    # Copper surfaces and dielectric faces follow the selected stackup.
    z=0.
    dks=[]
    for i,d in enumerate(g['stackup']['dielectrics']):
        next_layer=g['stackup']['copperLayers'][i+1]
        zend=z-d['thicknessMm']
        dks.append((zend,z,d['designDk']))
        layerz[next_layer['tscircuitLayer']]=zend
        z=zend-next_layer['thicknessMm'] if i<4 else zend
    bottom=layerz['bottom']
    copper=copper_objects(g['boardContext'])
    bylayer={l:[] for l in layerz}
    target_ids={s['traceId'] for s in stages}
    for obj in copper:
        # Via objects also carry their owning trace ID. Keep their pad lands.
        if obj.get('trace') in target_ids and obj['label']==obj['trace']:continue
        if not obj['shape'].intersects(crop):
            continue
        for layer in obj['layers']:
            if layer in bylayer:
                bylayer[layer].append(obj['shape'].intersection(crop))
    for s in stages:
        for seg in s['segments']:
            line=LineString([tuple(seg['from'].values()),tuple(seg['to'].values())])
            geom=line.buffer(seg['widthMm']/2,quad_segs=8)
            cut=geom.intersection(box(input_x,100,output_x,110))
            if not cut.is_empty:bylayer[seg['layer']].append(cut)
    land_checks=[]
    for s in stages:
        for v in s['vias']:
            if not crop.contains(Point(v['x'],v['y'])):continue
            rad=(v['outer_diameter']+v['hole_diameter'])/4
            for layer in ['top','bottom']:
                union=unary_union(bylayer[layer])
                for theta in np.linspace(0,2*np.pi,17)[:-1]:
                    assert union.covers(Point(v['x']+rad*np.cos(theta),v['y']+rad*np.sin(theta))), 'Missing signal-via land'
                land_checks.append({'via':v['pcb_via_id'],'layer':layer,'covered':True})
    # The shared surface helper omits inner pours; add them explicitly.
    for e in g['boardContext']:
        if e['type']=='pcb_copper_pour' and e['layer'].startswith('inner'):
            b=e['brep_shape']
            p=Polygon([(v['x'],v['y']) for v in b['outer_ring']['vertices']],
                      [[(v['x'],v['y']) for v in r['vertices']] for r in b.get('inner_rings',[])])
            if p.intersects(crop):bylayer[e['layer']].append(p.intersection(crop))
    specs=[]
    for side in [0,1]:
        xx=input_x if side==0 else output_x
        layer='bottom' if side==0 else 'top'
        ground_layer='inner4' if side==0 else 'inner1'
        for s in stages:
            lines=[LineString([tuple(seg['from'].values()),tuple(seg['to'].values())])
                   for seg in s['segments'] if seg['layer']==layer]
            pt=unary_union(lines).intersection(LineString([(xx,100),(xx,110)]))
            assert pt.geom_type=='Point',str(pt)
            specs.append((xx,pt.y,W,layerz[layer],layerz[ground_layer]))
            reference=unary_union(bylayer[ground_layer])
            assert reference.covers(LineString([(xx,pt.y-W/2),(xx,pt.y+W/2)])), 'Port lies over a plane opening'
    mesh.AddLine('x',grid_axis(xlo,xhi,resolution,[p[0] for p in specs]))
    mesh.AddLine('y',grid_axis(ylo,yhi,resolution,
                             [v for p in specs for v in [p[1]-p[2]/2,p[1],p[1]+p[2]/2]]))
    # All discontinuous copper ends before the absorbing boundary. PML must
    # not contain vias, apertures or material discontinuities along propagation.
    for axis,lo,hi in [('x',xlo,xhi),('y',ylo,yhi)]:
        extension=np.linspace(.1,padding,max(15,int(np.ceil(padding/.1))))
        mesh.AddLine(axis,np.r_[lo-extension,hi+extension])
    air_height=options.air_height if options else 1.6
    air_steps=np.arange(.1,air_height+.0001,.1)
    zlines=list(np.r_[bottom-air_steps,air_steps])
    for lo,hi,er in dks:
        z_refine=options.z_refinement if options else 1
        count=max(2,int(np.ceil((hi-lo)/((.0125 if er==4.1 else .08)/z_refine))))
        zlines.extend(np.linspace(lo,hi,count+1))
    zlines.extend(layerz.values())
    zlines.extend([T/2,T,T+.01524,.03048,bottom-T,bottom-T/2,bottom-T-.01524,bottom-.03048])
    mesh.AddLine('z',sorted(set(zlines)))
    guarded=[('z',bottom-T-.01524,T+.01524)] if continued else [('x',xlo,xhi),('y',ylo,yhi),('z',bottom-T-.01524,T+.01524)]
    for axis,lo,hi in guarded:
        grid=mesh.GetLines(axis,do_sort=True)
        assert grid[8] < lo and grid[-9] > hi, 'Material intersects absorbing boundary: '+axis
    material_bounds=[xlo-padding,ylo-padding,xhi+padding,yhi+padding] if continued else bounds
    mxlo,mylo,mxhi,myhi=material_bounds
    for i,(lo,hi,er) in enumerate(dks):
        mat=csx.AddMaterial('dielectric_'+str(i),epsilon=er)
        upper_copper=g['stackup']['copperLayers'][i]['thicknessMm'] if i else 0
        mat.AddBox([mxlo,mylo,lo],[mxhi,myhi,hi+upper_copper],priority=1)
    mask=csx.AddMaterial('mask',epsilon=3.8)
    mask.AddBox([mxlo,mylo,0],[mxhi,myhi,.03048],priority=2)
    mask.AddBox([mxlo,mylo,bottom-.03048],[mxhi,myhi,bottom],priority=2)
    pec=csx.AddMetal('exported_copper_PEC')
    mask_air=csx.AddMaterial('mask_hole_air',epsilon=1)
    counts={}
    for layer,shapes in bylayer.items():
        combined=unary_union(shapes).buffer(0)
        # Barrels are hollow. Keep drill holes out of annular rings.
        drills=[]
        for v in g['boardContext']:
            if v['type']=='pcb_via' and layer in v['layers']:
                if crop.intersects(Point(v['x'],v['y'])):
                    drills.append(Point(v['x'],v['y']).buffer(v['hole_diameter']/2,quad_segs=12))
        if drills:combined=combined.difference(unary_union(drills))
        combined=combined.simplify(.001,preserve_topology=True)
        if continued:combined=continue_boundary(combined,bounds,padding)
        counts[layer]=len(polygons(combined))
        holemat=csx.AddMaterial('copper_hole_fill_'+layer,
              epsilon=3.8 if layer in ['top','bottom'] else (4.1 if layer in ['inner1','inner4'] else 4.6))
        metal_parts=polygons(combined)
        for poly in metal_parts:
            # Restore copper islands inside another polygon's dielectric hole.
            depth=sum(Polygon(other.exterior).covers(poly.representative_point())
                      for other in metal_parts if other is not poly)
            priority=10+20*depth
            if layer in ['top','bottom']:
                # Uniform extrusion uses average finished width, a declared approximation.
                zbase=0 if layer=='top' else bottom-T
                add_polygon(pec,poly,zbase,T,priority=priority,hole_prop=holemat)
                add_polygon(mask,poly,T if layer=='top' else bottom-T-.01524,.01524,3,hole_prop=mask_air)
            else:
                thickness=next(l['thicknessMm'] for l in g['stackup']['copperLayers'] if l['tscircuitLayer']==layer)
                add_polygon(pec,poly,layerz[layer]-thickness,thickness,priority=priority,hole_prop=holemat)
    vias=0
    for v in g['boardContext']:
        if v['type']!='pcb_via' or not crop.contains(Point(v['x'],v['y'])):continue
        x,y=v['x'],v['y']; r=v['hole_diameter']/2
        # Shell thickness 20 um; bore dielectric is air. Factory fill is unresolved.
        pec.AddCylindricalShell([x,y,bottom-T],[x,y,T],radius=r+.01,shell_width=.02,priority=100)
        air=csx.AddMaterial('bore_'+str(vias),epsilon=1)
        air.AddCylinder([x,y,bottom-T],[x,y,T],radius=r,priority=110)
        vias+=1
    return specs, {'type':'exported-PCB-copper-stage','channel':channel,
        'sourceSha256':g['sourceSha256'],'handoffSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'boundsMm':bounds,'layerZMm':layerz,'copperPolygonCounts':counts,'viaCount':vias,
        'scope':'Connector-side via pair only; bridge/BGA and ESD package excluded',
        'signalViaLandChecks':land_checks,
        'polygonSimplificationToleranceMm':.001,'airPaddingToBoundaryMm':padding,
        'airHeightMm':air_height,
        'lateralBoundary':'Edge cross sections continued through PML' if continued else 'Finite cropped board in air',
        'assumptions':['PEC copper; no conductor or dielectric loss',
            'Nominal selected stackup; factory Dk, plating and retained pads are unconfirmed',
            'Surface copper rectangular finished thickness 40.64 um; no etch taper',
            '20 um barrel plating; empty air bores; no via fill material',
            'Nearby exported copper included; components and cropped conductors left open',
            'Embedded vertical lumped ports at stage endpoints; no package model',
            'Internal copper represented as 15.2 um PEC; dielectric fills unused copper regions']}

def run(args):
    name=f'{args.case}-{args.channel}-{args.resolution:g}-{args.length:g}-{args.excitation}'
    dest=(OUT/'iterations'/args.variant/name) if args.variant else OUT/name
    dest.mkdir(parents=True,exist_ok=True)
    fdtd=openEMS(NrTS=args.steps,EndCriteria=1e-5)
    fdtd.SetTimeStepFactor(.8)
    fdtd.SetGaussExcite(8e9,8e9)
    fdtd.SetBoundaryCond(['PML_8']*6 if args.case=='board' else ['PML_8']*4+['PEC','PML_8'])
    csx=ContinuousStructure();fdtd.SetCSX(csx)
    mesh=csx.GetGrid();mesh.SetDeltaUnit(.001)
    if args.case=='control':specs,meta=setup_control(fdtd,csx,mesh,args.resolution,args.length,args)
    else:specs,meta=setup_board(fdtd,csx,mesh,args.resolution,args.channel,args)
    active={'d1':[1,-1,0,0],'d2':[0,0,1,-1],
            'c1':[1,1,0,0],'c2':[0,0,1,1]}[args.excitation]
    ports=[]
    actual_specs=[]
    posts=csx.AddMetal('terminal_return_posts') if args.port_style=='edge' else None
    for i,(x,y,w,z,ground) in enumerate(specs):
        if args.port_style=='edge':
            # Exact grid coordinates avoid expanding a point current probe
            # across two cells because of sub-femtometre coordinate roundoff.
            xg=mesh.GetLines('x',do_sort=True);yg=mesh.GetLines('y',do_sort=True)
            ix=int(np.argmin(abs(xg-x)));iy=int(np.argmin(abs(yg-y)))
            x,y=float(xg[ix]),float(yg[iy])
            zg=mesh.GetLines('z',do_sort=True)
            z=float(zg[np.argmin(abs(zg-z))]);ground=float(zg[np.argmin(abs(zg-ground))])
            candidates=zg[(zg>min(z,ground)+1e-9)&(zg<max(z,ground)-1e-9)]
            gap_end=candidates[np.argmin(abs(candidates-z))]
            posts.AddBox([x,y,ground],[x,y,gap_end],priority=120)
            start,stop=[x,y,gap_end],[x,y,z]
        else:start,stop=[x,y-w/2,ground],[x,y+w/2,z]
        actual_specs.append({'start':start,'stop':stop})
        ports.append(fdtd.AddLumpedPort(i+1,42.5,start,stop,'z',excite=active[i],priority=150 if posts else 50))
        if args.port_style=='edge':
            probe=csx.GetPropertiesByName(ports[-1].I_filenames[0])[0]
            primitive=probe.GetPrimitive(0)
            # The explicit dual-cell face encloses only this resistor edge.
            zm=(start[2]+stop[2])/2
            # Place requested bounds just inside the target dual lines. The
            # solver expands them outwards, without roundoff adding a cell.
            eps=1e-6
            primitive.SetStart([(xg[ix-1]+xg[ix])/2+eps,(yg[iy-1]+yg[iy])/2+eps,zm])
            primitive.SetStop([(xg[ix]+xg[ix+1])/2-eps,(yg[iy]+yg[iy+1])/2-eps,zm])
            iz=int(np.argmin(abs(zg-min(start[2],stop[2]))))
            actual_specs[-1]['expectedCurrentIndices']=[[ix-1,iy-1,iz],[ix,iy,iz]]
    meta.update({'meshLines':{axis:len(mesh.GetLines(axis)) for axis in ['x','y','z']},
        'resolutionMm':args.resolution,'excitation':args.excitation,'ports':specs,
        'portStyle':args.port_style,'terminalGaps':actual_specs,
        'timeStepFactor':.8,'maximumTimeSteps':args.steps,
        'frequencyHz':[float(F.min()),float(F.max())],'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
    (dest/'setup.json').write_text(json.dumps(meta,indent=2))
    fdtd.Write2XML(str(dest/'model.xml'))
    if not args.post:
        (dest/'ABORT').unlink(missing_ok=True)
        (dest/'status.json').write_text(json.dumps({'state':'running','scriptSha256':meta['scriptSha256']}))
        (dest/'driver-source.py').write_bytes(Path(__file__).read_bytes())
        for old in ['summary.json','waves.npz']:
            (dest/old).unlink(missing_ok=True)
        status=fdtd.Run(str(dest),cleanup=True,numThreads=8,engine=args.engine,dump_statistics=True,
                        showProbeDiscretization=True,debug_PEC=args.debug)
        if status is not None and status != 0:
            raise RuntimeError('openEMS setup failed: '+str(status))
    for p in ports:p.CalcPort(str(dest),F,ref_impedance=42.5)
    a=np.array([p.uf_inc for p in ports]).T
    b=np.array([p.uf_ref for p in ports]).T
    transform=np.array([[1,-1,0,0],[0,0,1,-1],[1,1,0,0],[0,0,1,1]])/np.sqrt(2)
    am=a@transform.T;bm=b@transform.T
    incoming=am[:,{'d1':0,'d2':1,'c1':2,'c2':3}[args.excitation]]
    response=bm/incoming[:,None]
    np.savez(dest/'waves.npz',frequency=F,a=a,b=b,am=am,bm=bm,response=response)
    summary={'atGHz':{str(ghz):{'outgoingDb':[float(20*np.log10(max(abs(v),1e-15))) for v in response[np.argmin(abs(F-ghz*1e9))]],
        'incomingUnwantedRatio':float(np.max(abs(np.delete(am[np.argmin(abs(F-ghz*1e9))],{'d1':0,'d2':1,'c1':2,'c2':3}[args.excitation])))/abs(incoming[np.argmin(abs(F-ghz*1e9))]))}
        for ghz in [1,8,10,12,16]},'qualified':False}
    (dest/'summary.json').write_text(json.dumps(summary,indent=2))
    (dest/'status.json').write_text(json.dumps({'state':'completed','qualified':False,
        'scriptSha256':meta['scriptSha256']}))
    print(json.dumps({'directory':str(dest),'mesh':meta['meshLines'],'summary':summary}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--case',choices=['control','board'],default='control')
    p.add_argument('--channel',default='USB4_RX2')
    p.add_argument('--resolution',type=float,default=.02)
    p.add_argument('--length',type=float,default=3.)
    p.add_argument('--excitation',choices=['d1','d2','c1','c2'],default='d1')
    p.add_argument('--engine',default='multithreaded')
    p.add_argument('--steps',type=int,default=200000)
    p.add_argument('--post',action='store_true')
    p.add_argument('--debug',action='store_true')
    p.add_argument('--variant',default='')
    p.add_argument('--port-style',choices=['sheet','edge'],default='sheet')
    p.add_argument('--boundary',choices=['finite','continued'],default='finite')
    p.add_argument('--crop-margin',type=float,default=0)
    p.add_argument('--padding',type=float,default=1.5)
    p.add_argument('--z-refinement',type=float,default=1)
    p.add_argument('--air-height',type=float,default=1.6)
    run(p.parse_args())
