"""Encode CC-specific pour spacing with documented native rectangular keepouts.

Usage::
    python cc_pour_keepouts.py input.json output.json

The input object has ``routes`` and ``vias`` arrays. Each route is one contiguous
physical-layer run: ``{net, layer, width, points: [[x,y], ...], baseMarginMm,
ownViaCoords: [[x,y], ...]}``. Units are millimetres and coordinates are absolute
board coordinates. ``baseMarginMm`` must be the smallest native trace-to-pour
margin on that layer (for example .205 on L3 or .26 on L4). Each via has ``x``,
``y``, ``outer_diameter`` (or ``pad``), and an optional ``pcb_via_id``. Supply all
existing and planned through vias; list the run's own endpoint/handoff vias in
``ownViaCoords`` so they are distinguished from foreign obstacles. Every listed
own-via coordinate must exist in ``vias`` within .0000001 mm; a missing endpoint
is an input error, even when its copper would not intersect the desired annulus.

Output is ``{passed, violations, proofs, keepouts}``. ``keepouts`` contains native
Circuit JSON ``pcb_keepout`` rectangles with ``allow_traces`` and
``allow_placements`` enabled. Source JSX must map these flags to the documented
``allowTraces`` and ``allowPlacements`` props and preserve the absolute frame.
Native copper-pour conversion subtracts these rectangles even with both flags
set. Vias are never exempt from keepout diagnostics, so every rectangle avoids
all via disks. A .0051 mm (5.1 µm) via guard exceeds the native placement
checker's .005 mm contact tolerance. Tile overlaps of .000003 mm (3 nm) prevent
native integer-geometry rounding gaps.

The desired moat is .383 mm from wire copper, providing .002 mm allowance above
the .381 mm CC rule. The rectangle cover stays within a .390 mm outer moat and
starts inside the native clearance. Proofs require zero missed desired area and
zero via overlap. A foreign via closer than .3882 mm to wire copper is refused
(.383 mm desired clearance + .0051 mm via guard + .0001 mm reserve);
clipping a ribbon around a nearby power via must not expose an unchecked plane
sliver. Exit status is nonzero on any refusal or coverage failure.

This is a constraint encoder, not a router. It neither changes routes nor edits
emitted copper. Always refill with tscircuit's native pour solver, inspect actual
copper spacing, check references and power continuity, and rerun full-board
validation before using the constraints for fabrication.
"""
import json,sys,math
from pathlib import Path
from shapely.geometry import Point,LineString,box
from shapely.ops import unary_union
from shapely.prepared import prep

def generate(data):
    rectangles=[]; proofs=[]; violations=[]
    for ridx,r in enumerate(data['routes']):
        missing_own_vias=[p for p in r.get('ownViaCoords',[])
                          if not any(math.hypot(v['x']-p[0],v['y']-p[1])<1e-7
                                     for v in data.get('vias',[]))]
        if missing_own_vias:
            violations.append(dict(route=r['net'],missingOwnViaCoords=missing_own_vias,
                                   reason='Every route endpoint/handoff via must be present in input vias'))
            continue
        line=LineString(r['points']);half=r['width']/2;base=r['baseMarginMm'];net=r['net'];layer=r['layer']
        desired=line.buffer(half+.383,quad_segs=128).difference(line.buffer(half+max(0,base-.005),quad_segs=128))
        outer=line.buffer(half+.39,quad_segs=128)
        via_disks=[]
        for v in data.get('vias',[]):
            q=Point(v['x'],v['y']);rad=v.get('outer_diameter',v.get('pad',.25))/2
            copper=q.buffer(rad,quad_segs=128);gap=line.distance(q)-half-rad
            is_route_via=any(q.distance(Point(*p))<1e-7 for p in r.get('ownViaCoords',[]))
            if not is_route_via and gap<.3882-1e-7:
                violations.append(dict(route=net,via=v.get('pcb_via_id'),x=v['x'],y=v['y'],copperGapMm=gap,requiredForKeepoutProofMm=.3882))
            if copper.distance(outer)<.0061:
                # Native keepout placement treats gaps up to 5 µm as contact.
                via_disks.append(q.buffer(rad+.0051,quad_segs=128))
        if violations:continue
        allowed=outer.difference(unary_union(via_disks))
        outside=desired.difference(allowed)
        if outside.area>1e-10:
            violations.append(dict(route=net,uncoverableDesiredAreaMm2=outside.area));continue
        pa,pd=prep(allowed),prep(desired);stack=[outer.bounds];out=[];uncovered=[];cells=0
        while stack:
            bounds=stack.pop();rect=box(*bounds);cells+=1
            if not pd.intersects(rect):continue
            expanded=box(bounds[0]-.000003,bounds[1]-.000003,bounds[2]+.000003,bounds[3]+.000003)
            if pa.covers(expanded):out.append(expanded);continue
            x0,y0,x1,y1=bounds
            if max(x1-x0,y1-y0)<.00002:
                uncovered.append(rect.intersection(desired));continue
            if x1-x0>=y1-y0:
                mid=(x0+x1)/2;stack.extend([(x0,y0,mid,y1),(mid,y0,x1,y1)])
            else:
                mid=(y0+y1)/2;stack.extend([(x0,y0,x1,mid),(x0,mid,x1,y1)])
        # Merge touching dyadic strips; the 3 nm overlap remains at T-junctions.
        def merge_rects(items, horizontal):
            groups={}
            for p in items:
                a,b,c,d=p.bounds
                key=(round(b,10),round(d,10)) if horizontal else (round(a,10),round(c,10))
                groups.setdefault(key,[]).append((a,c) if horizontal else (b,d))
            merged=[]
            for key, intervals in groups.items():
                intervals.sort();lo,hi=intervals[0]
                for p,q in intervals[1:]:
                    if p<=hi+1e-10:hi=max(hi,q)
                    else:
                        merged.append(box(lo,key[0],hi,key[1]) if horizontal else box(key[0],lo,key[1],hi));lo,hi=p,q
                merged.append(box(lo,key[0],hi,key[1]) if horizontal else box(key[0],lo,key[1],hi))
            return merged
        for _ in range(8):
            before=len(out);out=merge_rects(merge_rects(out,True),False)
            if len(out)==before:break
        cover=unary_union(out);missing=desired.difference(cover).area
        overlaps=cover.intersection(unary_union(via_disks)).area if via_disks else 0
        if missing>1e-9 or overlaps>1e-12:
            violations.append(dict(route=net,missingDesiredAreaMm2=missing,viaOverlapAreaMm2=overlaps));continue
        for i,p in enumerate(out):
            x0,y0,x1,y1=p.bounds
            rectangles.append(dict(type='pcb_keepout',pcb_keepout_id=f'cc_moat_{ridx}_{i}',shape='rect',center={'x':(x0+x1)/2,'y':(y0+y1)/2},width=x1-x0,height=y1-y0,layers=[layer],allow_traces=True,allow_placements=True,description=f'{net} native pour moat: 15 mil signal clearance'))
        proofs.append(dict(net=net,layer=layer,rectangleCount=len(out),visitedCells=cells,desiredMoatAreaMm2=desired.area,coveredDesiredAreaMm2=desired.intersection(cover).area,missingDesiredAreaMm2=missing,viaOverlapAreaMm2=overlaps,baseMarginMm=base,encodedClearanceMm=.39,requiredClearanceMm=.381,desiredProofClearanceMm=.383))
    return dict(passed=not violations,violations=violations,proofs=proofs,keepouts=rectangles)
if __name__=='__main__':
    src=Path(sys.argv[1]);out=generate(json.loads(src.read_text()));dest=Path(sys.argv[2]);dest.write_text(json.dumps(out,indent=2));print(json.dumps({k:v for k,v in out.items()if k!='keepouts'},indent=2));print('OUTPUT',dest)
    sys.exit(0 if out['passed'] else 1)
