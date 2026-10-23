"""Nominal local PCB geometry for the multi-channel extraction batch."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
from shapely.geometry import Point,Polygon,LineString,box
from shapely.ops import unary_union
import em3d as base

def load_handoff(args, plan=None, plan_metadata=None):
    explicit=getattr(args,'handoff_file',None)
    handoff=Path(explicit).resolve() if explicit else base.ROOT/'dist/si-channel-review/field-solver-handoff.json'
    raw=handoff.read_bytes();g=json.loads(raw);digest=hashlib.sha256(raw).hexdigest()
    source=Path(g['sourceFile']);source=source if source.is_absolute() else base.ROOT/source
    if hashlib.sha256(source.read_bytes()).hexdigest()!=g['sourceSha256']:
        raise ValueError('Handoff board source SHA256 mismatch')
    if explicit and (not plan_metadata or not all(plan_metadata.get(k) for k in ['sourceSha256','handoffSha256'])):
        raise ValueError('Explicit handoff requires plan sourceSha256 and handoffSha256 metadata')
    for metadata in [plan or {},plan_metadata or {}]:
        if metadata.get('sourceSha256') and metadata['sourceSha256']!=g['sourceSha256']:
            raise ValueError('Plan and handoff source SHA256 mismatch')
        if metadata.get('handoffSha256') and metadata['handoffSha256']!=digest:
            raise ValueError('Plan and handoff file SHA256 mismatch')
    return handoff,g

def board_outline(g):
    b=next(e for e in g['boardContext'] if e['type']=='pcb_board')
    x,y=b['center']['x'],b['center']['y']
    shape=box(x-b['width']/2,y-b['height']/2,x+b['width']/2,y+b['height']/2)
    for e in g['boardContext']:
        if e['type']=='pcb_cutout':shape=shape.difference(Polygon([(p['x'],p['y']) for p in e['points']]))
    return shape

def axis_grid(lo,hi,step,anchors):
    anchors=sorted(set(round(float(v),9) for v in [lo,hi,*anchors]))
    assert all(b-a>1e-5 for a,b in zip(anchors[:-1],anchors[1:])),anchors
    grid=list(np.arange(lo,hi+step*.1,step))+[lo,hi]
    grid=[v for v in grid if all(abs(v-a)>step*.35 for a in anchors)]
    return np.unique(np.round(grid+anchors,9))

def port_polygon(shape,reference,axis):
    point=Point(reference)
    pieces=base.polygons(shape)
    touching=[p for p in pieces if p.distance(point)<1e-6]
    assert len(touching)==1,('Reference does not touch exactly one conductor',reference,len(touching))
    poly=touching[0];normal=1-axis
    a=list(reference);b=list(reference);a[normal]-=2;b[normal]+=2
    cross=poly.intersection(LineString([a,b]))
    lines=base.linear_parts(cross);lines=[l for l in lines if l.distance(point)<1e-6]
    assert len(lines)==1,('Ambiguous conductor cross section',reference)
    return poly,lines[0].length

def setup(fdtd,csx,mesh,args,plan,plan_metadata=None):
    handoff,g=load_handoff(args,plan,plan_metadata)
    margin=args.crop_margin;bounds=[plan['boundsMm'][0]-margin,plan['boundsMm'][1]-margin,
        plan['boundsMm'][2]+margin,plan['boundsMm'][3]+margin]
    crop=box(*bounds);padding=args.padding
    extended=box(bounds[0]-padding,bounds[1]-padding,bounds[2]+padding,bounds[3]+padding)
    outline=board_outline(g)
    if getattr(args,'feature_mesh',False):
        board_bounds=outline.bounds
        guard_padding=max(padding,2.5)
        for a in [0,1]:
            if bounds[a]-guard_padding<board_bounds[a]<bounds[a]:bounds[a]=board_bounds[a]-.4
            if bounds[a+2]<board_bounds[a+2]<bounds[a+2]+guard_padding:bounds[a+2]=board_bounds[a+2]+.4
        crop=box(*bounds);extended=box(bounds[0]-padding,bounds[1]-padding,bounds[2]+padding,bounds[3]+padding)
    layers={'top':0.};dielectrics=[];z=0.
    for i,d in enumerate(g['stackup']['dielectrics']):
        layer=g['stackup']['copperLayers'][i+1];end=z-d['thicknessMm'];dielectrics.append((end,z,d['designDk']))
        layers[layer['tscircuitLayer']]=end;z=end-layer['thicknessMm'] if i<4 else end
    bottom=layers['bottom'];copper=base.copper_objects(g['boardContext'])
    assert all(crop.contains(Point(v['x'],v['y'])) for v in plan.get('principalReturnVias',[])), 'Principal return via outside crop'
    target=set(plan['traceIds']);excluded=set(plan['excludedTargetVias']);bylayer={l:[] for l in layers}
    for obj in copper:
        if obj['trace'] in target and obj['label']==obj['trace']:continue
        if obj['label'] in excluded:continue
        if not obj['shape'].intersects(crop):continue
        for layer in obj['layers']:
            if layer in bylayer:bylayer[layer].append(obj['shape'].intersection(crop))
    for e in g['boardContext']:
        if e['type']=='pcb_copper_pour' and e['layer'].startswith('inner'):
            b=e['brep_shape'];p=Polygon([(v['x'],v['y']) for v in b['outer_ring']['vertices']],
                [[(v['x'],v['y']) for v in r['vertices']] for r in b.get('inner_rings',[])])
            if p.intersects(crop):bylayer[e['layer']].append(p.intersection(crop))
    for conductor in plan['segments']:
        for s in conductor:bylayer[s['layer']].append(LineString([s['from'],s['to']]).buffer(s['widthMm']/2,quad_segs=8))
    merged={l:unary_union(shapes).buffer(0) for l,shapes in bylayer.items()}
    original={l:unary_union([o['shape'] for o in copper if l in o['layers']]) for l in ['top','bottom']}
    ports=[];feeds=[];collision_checks=[]
    for number,p in enumerate(plan['ports'],1):
        p=dict(p);layer=p['layer'];axis=p['axis'];normal=1-axis;xy=p['xy']
        allowed,width=port_polygon(original[layer],xy,axis)
        # Include the entire pad when a trace reference lies within its pad.
        p['traceWidthMm']=p['widthMm'];p['widthMm']=float(width)
        p['z']=layers[layer];ground_layer='inner1' if layer=='top' else 'inner4';p['groundZ']=layers[ground_layer]
        transverse=LineString([[xy[0]-(width/2 if normal==0 else 0),xy[1]-(width/2 if normal==1 else 0)],
                              [xy[0]+(width/2 if normal==0 else 0),xy[1]+(width/2 if normal==1 else 0)]])
        assert merged[ground_layer].buffer(1e-8).covers(transverse),('Reference plane crosses a ground opening',number,xy,width,ground_layer)
        accepted=None
        shifts=[plan['feedShiftMm'],.25,.18,.12]
        for shift in sorted(set(shifts),reverse=True):
            if shift>plan['feedShiftMm']+1e-9:continue
            feed=list(xy);feed[axis]-=p['incomingSign']*shift
            shape=LineString([xy,feed]).buffer(width/2,cap_style=2)
            collisions=[]
            for obj in copper:
                if layer not in obj['layers'] or obj['trace'] in target and obj['label']==obj['trace']:continue
                if obj['label'] in excluded:continue
                intersection=shape.intersection(obj['shape'])
                if intersection.area>1e-8 and not allowed.buffer(1e-7).covers(intersection):collisions.append(obj['label'])
            if collisions or not merged[ground_layer].buffer(1e-8).covers(Point(feed)):continue
            accepted=(feed,shape,shift);break
        assert accepted is not None,('No collision-free feed with a ground return',number,xy)
        feed,shape,shift=accepted;merged[layer]=unary_union([merged[layer],shape]);p['feedXY']=feed;p['feedShiftMm']=shift
        ports.append(p);collision_checks.append({'port':number,'passed':True,'feedShiftMm':shift})
    # Preserve physical board edges and the USB connector cutout. Continue
    # only artificial crop boundaries through lateral PML.
    laminate=base.continue_boundary(outline.intersection(crop),bounds,padding).intersection(outline)
    anchors=[[],[]]
    for p in ports:
        for a in [0,1]:anchors[a].extend([p['xy'][a],p['feedXY'][a]])
    for v in plan['selectedVias']:
        anchors[0].append(v['x']);anchors[1].append(v['y'])
    for axis,a in enumerate(['x','y']):
        lo,hi=bounds[axis],bounds[axis+2]
        if getattr(args,'feature_mesh',False):
            from feature_mesh import build_axis
            mesh.AddLine(a,build_axis(axis,args,plan,ports,g,bounds))
        else:mesh.AddLine(a,axis_grid(lo,hi,args.resolution,anchors[axis]))
        # Fixed 0.1 mm exterior grid; all source cells remain far from PML.
        extension=np.linspace(.1,padding,max(15,int(np.ceil(padding/.1))))
        mesh.AddLine(a,np.r_[lo-extension,hi+extension])
    air=np.arange(.1,args.air_height+.0001,.1);zlines=list(np.r_[bottom-air,air])
    for lo,hi,er in dielectrics:
        count=max(2,int(np.ceil((hi-lo)/((.0125 if er==4.1 else .08)/args.z_refinement))))
        zlines.extend(np.linspace(lo,hi,count+1))
    zlines.extend(layers.values());zlines.extend([base.T/2,base.T,base.T+.01524,.03048,bottom-base.T,bottom-base.T/2,bottom-base.T-.01524,bottom-.03048])
    if getattr(args,'fixed_feed_gap_mm',0):
        for p in ports:zlines.append(p['z']+np.sign(p['groundZ']-p['z'])*args.fixed_feed_gap_mm)
    # Round equivalent layer coordinates before deduplication; added gap
    # anchors must not create numerical sliver cells.
    mesh.AddLine('z',np.unique(np.round(zlines,12)) if getattr(args,'fixed_feed_gap_mm',0) else sorted(set(zlines)))
    for i,(lo,hi,er) in enumerate(dielectrics):
        mat=csx.AddMaterial('dielectric_'+str(i),epsilon=er)
        upper_copper=g['stackup']['copperLayers'][i]['thicknessMm'] if i else 0
        base.add_polygon(mat,laminate,lo,hi-lo+upper_copper,priority=1)
    mask=csx.AddMaterial('mask',epsilon=3.8)
    base.add_polygon(mask,laminate,0,.03048,priority=2);base.add_polygon(mask,laminate,bottom-.03048,.03048,priority=2)
    pec=csx.AddMetal('exported_copper_PEC');mask_air=csx.AddMaterial('mask_hole_air',epsilon=1);counts={}
    for layer,combined in merged.items():
        drills=[Point(v['x'],v['y']).buffer(v['hole_diameter']/2,quad_segs=12) for v in g['boardContext']
            if v['type']=='pcb_via' and v['pcb_via_id'] not in excluded and layer in v['layers'] and crop.intersects(Point(v['x'],v['y']))]
        if drills:combined=combined.difference(unary_union(drills))
        combined=base.continue_boundary(combined.simplify(.001,preserve_topology=True),bounds,padding).intersection(outline)
        holemat=csx.AddMaterial('copper_hole_fill_'+layer,epsilon=3.8 if layer in ['top','bottom'] else (4.1 if layer in ['inner1','inner4'] else 4.6))
        parts=base.polygons(combined);counts[layer]=len(parts)
        for poly in parts:
            depth=sum(Polygon(other.exterior).covers(poly.representative_point()) for other in parts if other is not poly);priority=10+20*depth
            if layer in ['top','bottom']:
                zbase=0 if layer=='top' else bottom-base.T
                base.add_polygon(pec,poly,zbase,base.T,priority=priority,hole_prop=holemat)
                mask_priority=3+20*depth if getattr(args,'feature_mesh',False) else 3
                base.add_polygon(mask,poly,base.T if layer=='top' else bottom-base.T-.01524,.01524,mask_priority,hole_prop=mask_air)
            else:
                thickness=next(l['thicknessMm'] for l in g['stackup']['copperLayers'] if l['tscircuitLayer']==layer)
                base.add_polygon(pec,poly,layers[layer]-thickness,thickness,priority=priority,hole_prop=holemat)
    via_count=0;lands=[];via_sampling=[]
    for v in g['boardContext']:
        if v['type']!='pcb_via' or v['pcb_via_id'] in excluded or not crop.contains(Point(v['x'],v['y'])):continue
        x,y=v['x'],v['y'];r=v['hole_diameter']/2
        pec.AddCylindricalShell([x,y,bottom-base.T],[x,y,base.T],radius=r+.01,shell_width=.02,priority=100)
        csx.AddMaterial('bore_'+str(via_count),epsilon=1).AddCylinder([x,y,bottom-base.T],[x,y,base.T],radius=r,priority=110);via_count+=1
        if getattr(args,'feature_mesh',False):
            xnodes=mesh.GetLines('x',do_sort=True);ynodes=mesh.GetLines('y',do_sort=True)
            xx=xnodes[abs(xnodes-x)<r+.02000001];yy=ynodes[abs(ynodes-y)<r+.02000001]
            radial=np.hypot(xx[:,None]-x,yy[None,:]-y)
            nodes=int(np.sum((radial>r+1e-9)&(radial<r+.02-1e-9)))
            assert nodes>=3,('Via barrel under-sampled',v['pcb_via_id'],nodes,x,y)
            via_sampling.append({'via':v['pcb_via_id'],'verticalPECNodes':nodes,'passed':True})
        if any(v['pcb_via_id']==s['pcb_via_id'] for s in plan['selectedVias']):
            radius=(v['outer_diameter']+v['hole_diameter'])/4
            for layer in ['top','bottom']:
                assert all(merged[layer].covers(Point(x+radius*np.cos(t),y+radius*np.sin(t))) for t in np.linspace(0,2*np.pi,17)[:-1]),'Missing signal land'
                lands.append({'via':v['pcb_via_id'],'layer':layer,'covered':True})
    for p in ports:
        feed=p['feedXY'];prop=csx.GetPropertyByCoordPriority([*feed,p['groundZ']-.0076])
        assert prop and prop.GetName()=='exported_copper_PEC',('Feed ground not PEC',feed)
    pml_checks=[]
    for axis in [0,1]:
        lines=mesh.GetLines('xy'[axis],do_sort=True)
        for side,positions in [('low',(lines[:8]+lines[1:9])/2),('high',(lines[-9:-1]+lines[-8:])/2)]:
            transverse=np.linspace(bounds[1-axis]+.017,bounds[3-axis]-.017,7)
            for other in transverse:
                for z in [.02,-.05,-.105,-.3,-.67,-.75,-.795,-1.,-1.36,-1.42,-1.49]:
                    names=[]
                    for value in positions:
                        point=[0.,0.,z];point[axis]=value;point[1-axis]=other
                        prop=csx.GetPropertyByCoordPriority(point);names.append(prop.GetName() if prop else 'air')
                    assert len(set(names))==1,('Material changes within PML',axis,side,other,z,names)
            pml_checks.append({'axis':axis,'side':side,'passed':True})
    return ports,{'type':'exported-PCB-copper-stage','channel':plan['channel'],'regionKind':plan['kind'],
        'sourceSha256':g['sourceSha256'],'handoffSha256':hashlib.sha256(handoff.read_bytes()).hexdigest(),
        'handoffFile':str(handoff),'stackupCode':g['stackup']['code'],
        'stackupCopperThicknessMm':{l['tscircuitLayer']:l['thicknessMm'] for l in g['stackup']['copperLayers']},
        'stackupDielectrics':g['stackup']['dielectrics'],
        'boundsMm':bounds,'layerZMm':layers,'copperPolygonCounts':counts,'viaCount':via_count,
        'physicalBoardOutlinePreserved':True,'signalViaLandChecks':lands,'feedCollisionChecks':collision_checks,'pmlMaterialChecks':pml_checks,
        'viaDiscretizationChecks':via_sampling,
        'minimumMeshStepMm':{a:float(np.diff(mesh.GetLines(a,do_sort=True)).min()) for a in ['x','y','z']},
        'lateralBoundary':'Artificial crop edge cross sections continued through PML; physical board outline retained',
        'scope':'Local PCB transition only; component and connector internals excluded','regionPlan':plan,
        'assumptions':['PEC copper and lossless dielectric','Nominal stackup and 20 um hollow barrel plating',
            'Rectangular surface copper 40.64 um thick','Nearby exported copper included; component internals omitted']}
