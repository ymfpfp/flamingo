"""Check trace-width GND support for the rendered PCIe TX and RX routes.

Requires the Shapely version in requirements.txt. Run from the project root:
python simulations/pcie-tx/check_reference_planes.py rendered.circuit.json
"""
import json, sys
from pathlib import Path
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

j=json.loads(Path(sys.argv[1]).read_text())
if isinstance(j,dict): j=j['circuitJson']
components={c['name']:c['source_component_id'] for c in j if c['type']=='source_component'}
sp=[p for p in j if p['type']=='source_port']; pp=[p for p in j if p['type']=='pcb_port']
traces=[t for t in j if t['type']=='pcb_trace']
planes={p['layer']:Polygon([(v['x'],v['y']) for v in p['brep_shape']['outer_ring']['vertices']],
    [[(v['x'],v['y']) for v in r['vertices']] for r in p['brep_shape'].get('inner_rings',[])])
    for p in j if p['type']=='pcb_copper_pour' and p['layer'] in ['inner1','inner4']}
def port(component,pin):
    p=next(p for p in sp if p['source_component_id']==components[component] and pin in p.get('port_hints',[]))
    return next(q for q in pp if q['source_port_id']==p['source_port_id'])
def route(a,b):
    def match(t,p): return any(abs(q['x']-p['x'])<1e-4 and abs(q['y']-p['y'])<1e-4 for q in [t['route'][0],t['route'][-1]])
    return next(t for t in traces if match(t,a) and match(t,b))
tx=[('R20','R21','B14','B15'),('U20','U21','B19','B20'),('Y17','AA17','B23','B24'),('Y15','AA15','B27','B28')]
rx=[('N21','N20','A16','A17'),('W21','W20','A21','A22'),('Y19','AA19','A25','A26'),('AA13','Y13','A29','A30')]
paths=[]
for lane,balls in enumerate(tx):
    for i,pol in enumerate('PN'):
        paths.append((f'TX{lane}_{pol} bridge',route(port('ASM2464PDX',balls[i]),port(f'C_TX{lane}_{pol}','pin1'))))
        paths.append((f'TX{lane}_{pol} connector',route(port(f'C_TX{lane}_{pol}','pin2'),port('PCIe',balls[i+2]))))
for lane,balls in enumerate(rx):
    for i,pol in enumerate('PN'): paths.append((f'RX{lane}_{pol}',route(port('ASM2464PDX',balls[i]),port('PCIe',balls[i+2]))))
results=[]
for name,trace in paths:
    own=[Point(p['x'],p['y']) for p in trace['route'] if p['route_type']=='via']
    openings={layer:unary_union([Polygon(r) for r in plane.interiors if any(Polygon(r).covers(p) for p in own)]) for layer,plane in planes.items()}
    area=0
    for a,b in zip(trace['route'],trace['route'][1:]):
        if a['route_type']!= 'wire' or b['route_type']!='wire' or a['layer']!=b['layer']: continue
        if abs(a['x']-b['x'])+abs(a['y']-b['y'])<1e-8: continue
        layer='inner1' if a['layer']=='top' else 'inner4'
        copper=LineString([(a['x'],a['y']),(b['x'],b['y'])]).buffer(a['width']/2,cap_style=2)
        unsupported=copper.difference(planes[layer]).difference(openings[layer])
        area+=unsupported.area
    results.append({'name':name,'copperAreaOverUnrelatedVoidMm2':area})
out={'passed':all(r['copperAreaOverUnrelatedVoidMm2']<1e-7 for r in results),'conductors':results,
    'scope':'Trace-width projection over the GND reference planes, excluding openings containing this route own signal vias. This is not a 3D field-footprint or return-loss check.'}
output=Path(__file__).resolve().parents[2]/'dist/pcie-rx-routing/reference-planes.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(out,indent=2))
print('PCIe TX/RX trace-width GND support:', 'passed' if out['passed'] else 'failed')
if not out['passed']:
    print(json.dumps([r for r in results if r['copperAreaOverUnrelatedVoidMm2']>=1e-7],indent=2))
sys.exit(0 if out['passed'] else 1)
