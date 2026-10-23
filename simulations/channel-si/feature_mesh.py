"""Feature-driven XY mesh with stable grids across extraction crop studies."""
import numpy as np
from shapely.geometry import Point,box,LineString
from shapely.ops import unary_union
from CSXCAD.SmoothMeshLines import SmoothMeshLines

def build_axis(axis,args,plan,ports,geometry,bounds):
    step=args.resolution;barrel=args.barrel_step_mm
    enhanced=getattr(args,'resolve_lands',False)
    outer=.06*(step/.025)
    context=4.0
    full_lo=min(plan['boundsMm'][axis]-context,bounds[axis]);full_hi=max(plan['boundsMm'][axis+2]+context,bounds[axis+2])
    hard=[];soft=[];zones=[]
    for p in ports:hard.extend([p['xy'][axis],p['feedXY'][axis]])
    for v in plan['selectedVias']:hard.append(v['xy'[axis]])
    # Preserve all candidate crop edges as anchors. Expanding the domain
    # then leaves the measured fixture's interior grid exactly unchanged.
    for margin in [0,.8,1.6,2.4,3.2,4.0]:
        hard.extend([plan['boundsMm'][axis]-margin,plan['boundsMm'][axis+2]+margin])
    positions=[p['xy'][axis] for p in ports]+[p['feedXY'][axis] for p in ports]
    for conductor in plan['segments']:
        for s in conductor:positions.extend([s['from'][axis],s['to'][axis]])
    zones.append((min(positions)-.25,max(positions)+.25,step))
    context_shape=box(min(plan['boundsMm'][0]-context,bounds[0]),min(plan['boundsMm'][1]-context,bounds[1]),
        max(plan['boundsMm'][2]+context,bounds[2]),max(plan['boundsMm'][3]+context,bounds[3]))
    selected={v['pcb_via_id'] for v in plan['selectedVias']}
    principal={v['pcb_via_id'] for v in plan.get('principalReturnVias',[])}
    forced=set(plan.get('extraMeshVias',[]))
    dut=unary_union([LineString([s['from'],s['to']]) for c in plan['segments'] for s in c])
    for v in geometry['boardContext']:
        if v['type']!='pcb_via' or v['pcb_via_id'] in plan['excludedTargetVias']:continue
        if not context_shape.contains(Point(v['x'],v['y'])):continue
        if v['pcb_via_id'] not in selected|principal|forced and dut.distance(Point(v['x'],v['y']))>.6:continue
        center=v['xy'[axis]];radius=v['hole_diameter']/2
        local=barrel if v['pcb_via_id'] in selected else min(.015*(step/.025),step) if v['pcb_via_id'] in principal else step if v['pcb_via_id'] in forced else .04*(step/.025)
        extent=max(radius,v['outer_diameter']/2) if enhanced and v['pcb_via_id'] in selected|principal else radius
        zones.append((center-extent-.035,center+extent+.035,local))
        # Mid-wall hints guarantee sampled vertical metal on each barrel.
        if v['pcb_via_id'] in selected|principal|forced:
            soft.extend([center-radius-.01,center,center+radius+.01])
    if enhanced:
        for p in ports:
            if abs(p['widthMm']-p['traceWidthMm'])<1e-6:continue
            center=p['xy'][axis];extent=.05 if axis==p['axis'] else p['widthMm']/2+.025
            zones.append((center-extent,center+extent,barrel))
    # The official openEMS metal-edge rule: 1/3 cell inside, 2/3 outside.
    # Apply it at uniform reference/feed sections, away from the DUT bend.
    edges=[]
    for p in ports:
        if axis==p['axis']:continue
        c=p['xy'][axis];w=p['widthMm']
        if enhanced and abs(p['widthMm']-p['traceWidthMm'])<1e-6:edges.extend([(c-w/2,1),(c+w/2,-1)])
        elif enhanced:continue # Widened pad terminals use a dense mesh, not uniform-line edge stencils.
        else:soft.extend([c-w/2+step/3,c-w/2-2*step/3,c+w/2-step/3,c+w/2+2*step/3])
    for lo,hi,h in zones:soft.extend([lo,hi])
    anchors=sorted(set(round(float(v),9) for v in [full_lo,full_hi,*hard] if full_lo-1e-8<=v<=full_hi+1e-8))
    assert np.diff(anchors).min()>.001,(axis,'mandatory anchors are too close')
    minimum=.50*min(barrel,step)
    protected=[]
    if enhanced:
        distinct=sorted(set(round(e,9) for e,direction in edges))
        for edge,inside in sorted(set((round(e,9),d) for e,d in edges)):
            local=min([step]+[h for lo,hi,h in zones if lo<edge+step and hi>edge-step])
            spacing=min([abs(edge-e) for e in distinct if abs(edge-e)>1e-8]+[1.])
            local=min(local,.4*spacing)
            first=round(edge+inside*local/3,9);second=round(edge-inside*2*local/3,9)
            lo,hi=sorted([first,second])
            assert not any(lo+1e-8<a<hi-1e-8 for a in anchors),('Mandatory line inside metal-edge stencil',axis,edge)
            assert not any(max(lo,a)<min(hi,b)-1e-8 for a,b in protected),('Overlapping metal-edge stencils',axis,edge)
            anchors=sorted(set(anchors+[lo,hi]));protected.append((lo,hi))
    for v in sorted(set(round(float(v),9) for v in soft)):
        if not(full_lo<v<full_hi):continue
        if any(a+1e-8<v<b-1e-8 for a,b in protected):continue
        i=int(np.searchsorted(anchors,v))
        if min(v-anchors[i-1],anchors[i]-v)<minimum:continue
        anchors.insert(i,v)
    nodes=[]
    for lo,hi in zip(anchors[:-1],anchors[1:]):
        maximum=min([outer]+[h for a,b,h in zones if a<hi-1e-9 and b>lo+1e-9])
        count=max(1,int(np.ceil((hi-lo)/maximum-(1e-6 if enhanced else 1e-10))))
        nodes.extend(np.linspace(lo,hi,count+1)[:-1])
    nodes.append(anchors[-1])
    # Use the native library's mesh smoother rather than moving references.
    nodes=SmoothMeshLines(nodes,outer,ratio=1.4,check_symmetry=False)
    lo,hi=bounds[axis],bounds[axis+2]
    result=np.unique(np.round(np.r_[nodes[(nodes>=lo-1e-8)&(nodes<=hi+1e-8)],lo,hi],9))
    assert np.diff(result).min()>minimum*.45,(axis,'mesh sliver',np.diff(result).min())
    assert np.diff(result).max()<outer*(1+1e-5),(axis,'unresolved outer interval',np.diff(result).max())
    return result
