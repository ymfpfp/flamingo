"""Encode Euclidean copper clearances as conservative native-router obstacles.

This module only converts constraints. All path search remains in tscircuit.
"""
import copy, hashlib, json, sys
from pathlib import Path
import shapely
from shapely.geometry import Point, LineString, Polygon, box
from shapely.ops import unary_union
from prepare_obstacles import cover_polygon
from check_acceptance import pth_launch, copper_boundary
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'simulations/power-distribution'))
from check_layout import model

board,job_file,staged_file,constraints,output=map(Path,sys.argv[1:6])
raw=json.loads(board.read_text());j=raw.get('circuitJson',raw) if isinstance(raw,dict) else raw
job=json.loads(job_file.read_text());staged=json.loads(staged_file.read_text())
cover=json.loads(constraints.read_text())
sha=hashlib.sha256(board.read_bytes()).hexdigest()
if sha!=cover['sourceSha256']:raise ValueError('Stale exact-obstacle isolation constraints')
j=copy.deepcopy(j)
for result in staged:
    source=f"exact_staged_{result['net']}"
    j.append({'type':'source_trace','source_trace_id':source,'connected_source_port_ids':[result['sourcePortId']],
              'connected_source_net_ids':[]})
    seen=set()
    for index,t in enumerate(result['traces']):
        j.append({**t,'type':'pcb_trace','pcb_trace_id':f'{source}_{index}','source_trace_id':source})
        for p in t['route']:
            if p['route_type']!='via':continue
            key=(p['x'],p['y'])
            if key in seen:continue
            seen.add(key)
            j.append({'type':'pcb_via','pcb_via_id':f'{source}_via_{len(seen)}','source_trace_id':source,
                'x':p['x'],'y':p['y'],'outer_diameter':p.get('via_diameter',.3),'hole_diameter':p.get('via_hole_diameter',.2),
                'layers':['top','inner1','inner2','inner3','inner4','bottom']})
j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(j)
net=root(job['terminals'][0]['sourcePortId']);gap=job['rule']['clearanceMm']
xs=[p['x'] for p in job['terminals']];ys=[p['y'] for p in job['terminals']]
padding=job.get('routingPaddingMm',6)
boundary=next(e for e in j if e['type']=='pcb_board')
bd=copper_boundary(j)
window=box(min(xs)-padding,min(ys)-padding,max(xs)+padding,max(ys)+padding).intersection(bd)
foreign={l:[] for l in ['top','bottom']}
staged_gaps={root(r['sourcePortId']):r['clearanceMm'] for r in staged}
for o in copper:
    if o['net']==net:continue
    g=max(gap,staged_gaps.get(o['net'],0))+.001
    layers=set(o['layers'])&{'top','bottom'}
    # Reserve internal traces on both surfaces as a conservative through-via
    # constraint. Inner pours may receive the already permitted new antipads.
    if o['trace'] and not layers:layers={'top','bottom'}
    if not layers or o['shape'].distance(window)>g+.01:continue
    shape=o['shape'].buffer(g,quad_segs=64).intersection(window)
    for l in layers:foreign[l].append(shape)
for r in cover['isolationRegions']:
    shape=shapely.from_wkb(bytes.fromhex(r['shapeWkbHex'])).buffer(r['requiredGapMm']+.001,quad_segs=128)
    if shape.intersects(window):foreign[r['layer']].append(shape.intersection(window))
for h in j:
    if h['type']=='pcb_hole' and h.get('hole_shape','circle')=='circle':
        shape=Point(h['x'],h['y']).buffer(h.get('hole_diameter',h.get('diameter',0))/2+.201,quad_segs=64).intersection(window)
        for l in foreign:foreign[l].append(shape)
# The physical checker excludes bounded openings belonging to this signal's
# own through-hole launches and planned vias. Apply the same scope here.
apertures=[]
for h in j:
    if h['type']=='pcb_plated_hole' and root(pp.get(h.get('pcb_port_id'),{}).get('source_port_id',''))==net:
        apertures.append(pth_launch(h,copper))
for v in job.get('plannedTerminalVias',[]):
    p=next(p for p in job['terminals'] if p['selector']==v['selector'])
    apertures.append(Point(p['x'],p['y']).buffer(max(v['holeMm']/2+.215,v['diameterMm']/2+.1),quad_segs=64))
own_apertures=unary_union(apertures)
for surface,plane in [('top','inner1'),('bottom','inner4')]:
    ground=unary_union([o['shape'] for o in copper if o['label'] in pours and o['net']==nets['GND'] and plane in o['layers']])
    cuts=unary_union([Point(p['x'],p['y']).buffer(max(p.get('via_hole_diameter',.2)/2+.215,p.get('via_diameter',.3)/2+.1),quad_segs=64)
        for r in staged if root(r['sourcePortId'])!=nets['GND'] for t in r['traces'] for p in t['route'] if p['route_type']=='via'])
    void=window.difference(ground.difference(cuts)).difference(own_apertures)
    foreign[surface].append(void)
obstacles=[];checks=[];geometries={}
grid=job.get('exactObstacleGridMm',.1)
near=unary_union([Point(p['x'],p['y']).buffer(.75,quad_segs=32) for p in job['terminals']])
for layer,shapes in foreign.items():
    shape=unary_union(shapes)
    if shape.is_empty:continue
    geometries[layer]=shape.wkb_hex
    fine=shape.intersection(near);coarse=shape.difference(near)
    rects=(cover_polygon(fine,.025) if not fine.is_empty else [])+(cover_polygon(coarse,grid) if not coarse.is_empty else [])
    covered=unary_union([box(*r) for r in rects])
    missed=shape.difference(covered.buffer(1e-9)).area
    if missed>1e-10:raise ValueError('Exact rule cover omitted forbidden area')
    checks.append({'layer':layer,'missedAreaMm2':missed,'rectangles':len(rects)})
    for i,(x0,y0,x1,y1) in enumerate(rects):
        obstacles.append({'type':'rect','obstacleId':f'exact_{layer}_{i}','center':{'x':(x0+x1)/2,'y':(y0+y1)/2},
            'width':x1-x0,'height':y1-y0,'layers':[layer],'connectedTo':[]})
output.write_text(json.dumps({'sourceSha256':sha,'net':job['name'],'gridMm':grid,'terminalGridMm':.025,'clearanceSafetyMm':.001,
    'forbiddenShapesWkbHex':geometries,'obstacles':obstacles,'checks':checks,
    'scope':'Foreign-copper Euclidean spacing, preserved high-speed isolation, reference openings and conservative full-stack trace reservations. No geometric route search.'}))
print(f"{job['name']}: encoded exact clearances in {len(obstacles)} native obstacles")
