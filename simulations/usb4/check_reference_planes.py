"""USB2/USB4 trace-width projection over L2/L5 ground; no 3D SI claim."""
import hashlib,json,sys
from pathlib import Path
from shapely.geometry import LineString,Point,Polygon
from shapely.ops import unary_union
from shapely.affinity import rotate

ROOT=Path(__file__).resolve().parents[2]
file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw)
if isinstance(j,dict):j=j['circuitJson']
sources={s['source_trace_id']:s for s in j if s['type']=='source_trace'}
names={key:s.get('name','') for key,s in sources.items()}
def netkey(t):return t.get('subcircuit_connectivity_map_key') or sources.get(t.get('source_trace_id'),{}).get('subcircuit_connectivity_map_key')
planes={e['layer']:Polygon([(v['x'],v['y']) for v in e['brep_shape']['outer_ring']['vertices']],
    [[(v['x'],v['y']) for v in r['vertices']] for r in e['brep_shape'].get('inner_rings',[])])
    for e in j if e['type']=='pcb_copper_pour' and e['layer'] in ['inner1','inner4']}
results=[]
for t in j:
    if t['type']!='pcb_trace' or not names.get(t.get('source_trace_id'),'').startswith(('USB2_','USB4_')):continue
    # ESD/shunt taps split one uninterrupted electrical conductor into several
    # named traces. Treat its via apertures consistently across those names.
    own_traces=[q for q in j if q['type']=='pcb_trace' and (q['pcb_trace_id']==t['pcb_trace_id'] or netkey(t) and netkey(q)==netkey(t))]
    own=[Point(p['x'],p['y']) for q in own_traces for p in q['route'] if p['route_type']=='via']
    openings={l:unary_union([Polygon(r) for r in plane.interiors if any(Polygon(r).covers(p) for p in own)]) for l,plane in planes.items()}
    area=0
    for a,b in zip(t['route'],t['route'][1:]):
        if a['route_type']!=b['route_type'] or a['route_type']!='wire' or a['layer']!=b['layer']:continue
        l='inner1' if a['layer']=='top' else 'inner4'
        copper=LineString([(a['x'],a['y']),(b['x'],b['y'])]).buffer(a['width']/2,cap_style=2)
        area+=copper.difference(planes[l]).difference(openings[l]).area
    results.append({'name':names[t['source_trace_id']],'copperAreaOverUnrelatedVoidMm2':area})
parents={}
def root(x):
    parents.setdefault(x,x)
    if parents[x]!=x:parents[x]=root(parents[x])
    return parents[x]
for s in j:
    groups=[]
    if s['type']=='source_trace':groups=[s.get('connected_source_port_ids',[])+s.get('connected_source_net_ids',[])]
    if s['type']=='source_component':groups=s.get('internally_connected_source_port_ids',[])
    for group in groups:
        for item in group[1:]:parents[root(item)]=root(group[0])
gnd=next(n for n in j if n['type']=='source_net' and n['name']=='GND')
ports={p['pcb_port_id']:p for p in j if p['type']=='pcb_port'}
rules=json.loads((ROOT/'jlcpcb-clearance-rules.json').read_text())['minimumMm']
hole_clearances=[]
for e in j:
    if e['type'] not in ['pcb_via','pcb_plated_hole','pcb_hole']:continue
    port=ports.get(e.get('pcb_port_id'),{})
    via_ports=sources.get(e.get('source_trace_id'),{}).get('connected_source_port_ids',[])
    if netkey(e)==gnd['subcircuit_connectivity_map_key'] or any(root(p)==root(gnd['source_net_id']) for p in via_ports) or e.get('source_net_id') and root(e['source_net_id'])==root(gnd['source_net_id']) or port.get('source_port_id') and root(port['source_port_id'])==root(gnd['source_net_id']):continue
    x,y=e['x'],e['y']
    if 'hole_diameter' in e:drill=Point(x,y).buffer(e['hole_diameter']/2,quad_segs=64)
    else:
        w,h=e['hole_width'],e['hole_height'];r=min(w,h)/2
        drill=LineString([(x-(w/2-r),y-(h/2-r)),(x+(w/2-r),y+(h/2-r))]).buffer(r,quad_segs=64)
        drill=rotate(drill,e.get('ccw_rotation',0),origin=(x,y))
    minimum=rules['innerViaDrillToCopper'] if e['type']=='pcb_via' else rules['innerPthDrillToCopper'] if e['type']=='pcb_plated_hole' else rules['npthToCopper']
    for layer,plane in planes.items():
        distance=plane.distance(drill)
        hole_clearances.append({'element':e.get('pcb_via_id',e.get('pcb_plated_hole_id',e.get('pcb_hole_id'))),
            'layer':layer,'gapMm':distance,'minimumMm':minimum,'passed':distance+.0005>=minimum})
report={'passed':len(results)==36 and all(r['copperAreaOverUnrelatedVoidMm2']<1e-7 for r in results)
    and all(h['passed'] for h in hole_clearances),
    'sourceFile':str(file),'sourceSha256':hashlib.sha256(raw).hexdigest(),'traces':results,'innerDrillClearances':hole_clearances,
    'scope':'Trace-width projection excludes each trace own signal-via apertures. No 3D field-footprint, loss or return-loss qualification.'}
out=ROOT/'dist/usb4-routing/reference-planes.json';out.write_text(json.dumps(report,indent=2))
print('USB2/USB4 reference-plane support:',report['passed'])
if not report['passed']:print([r for r in results if r['copperAreaOverUnrelatedVoidMm2']>=1e-7])
for h in hole_clearances:
    if not h['passed']:print('Inner drill clearance:',h)
sys.exit(0 if report['passed'] else 1)
