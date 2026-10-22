"""Screen emitted saved control routes, including their explicit via barrels."""
import hashlib,json,sys
from pathlib import Path
from check_acceptance import audit
from prepare_obstacles import isolation_cover

board,jobs_file,output=map(Path,sys.argv[1:4])
raw=json.loads(board.read_text());raw=raw.get('circuitJson',raw)if isinstance(raw,dict)else raw
jobs=json.loads(jobs_file.read_text())
sc={e['source_component_id']:e for e in raw if e['type']=='source_component'}
sp={e['source_port_id']:e for e in raw if e['type']=='source_port'}
pp={e['source_port_id']:e for e in raw if e['type']=='pcb_port'}
st={e['source_trace_id']:e for e in raw if e['type']=='source_trace'}
saved=json.loads(Path('manufacturing/control-routing/routed-surface.json').read_text())
top=json.loads(Path('manufacturing/control-routing/routed-top.json').read_text())
for name in dict.fromkeys(r['net']for r in top):
    saved.append({'net':name,'vias':[],'segments':[{'name':r['name']}for r in top if r['net']==name]})
selected=[];results=[];remove_traces=set();remove_vias=set()
for net in saved:
    job=next(j for j in jobs if j['name']==net['net'])
    terminals=[]
    for t in job['terminals']:
        part,pin=t['selector'].split('.')
        s=next(s for s in sp.values()if sc.get(s.get('source_component_id'),{}).get('name')==part and pin in s.get('port_hints',[]))
        terminals.append({**t,**pp[s['source_port_id']],'sourcePortId':s['source_port_id']})
    selected.append({**job,'terminals':terminals})
    names={s['name']for s in net['segments']}
    traces=[e for e in raw if e['type']=='pcb_trace' and st[e['source_trace_id']].get('name')in names]
    if len(traces)!=len(names):raise ValueError(f"Missing emitted wire sections: {net['net']}")
    remove_traces.update(t['pcb_trace_id']for t in traces)
    traces=[{'route':t['route']}for t in traces]
    for v in net['vias']:
        emitted=[e for e in raw if e['type']=='pcb_via' and abs(e['x']-v['x'])<1e-7 and abs(e['y']-v['y'])<1e-7]
        if len(emitted)!=1:raise ValueError(f"Missing or duplicate physical via: {v['name']}")
        e=emitted[0];remove_vias.add(e['pcb_via_id'])
        if abs(e['outer_diameter']-v['diameter'])>1e-7 or abs(e['hole_diameter']-v['hole'])>1e-7:raise ValueError('Via dimensions changed during replay')
        p={'route_type':'wire','x':e['x'],'y':e['y'],'width':job['rule']['widthMm'],'layer':'top'}
        traces.append({'route':[p,{'route_type':'via','x':e['x'],'y':e['y'],'from_layer':'top','to_layer':'bottom',
            'via_diameter':e['outer_diameter'],'via_hole_diameter':e['hole_diameter']},{**p,'layer':'bottom'}]})
    results.append({'net':net['net'],'solved':True,'traces':traces})
# Keep the actual fresh refill, pads and source connectivity. Extract only the
# tested copper so barrels are screened once rather than against themselves.
baseline=[e for e in raw if not(e['type']=='pcb_trace'and e['pcb_trace_id']in remove_traces)and not(e['type']=='pcb_via'and e['pcb_via_id']in remove_vias)]
import shapely
regions=[{**r,'shape':shapely.from_wkb(bytes.fromhex(r['shapeWkbHex']))}for r in isolation_cover(raw)['isolationRegions']]
report=audit(baseline,selected,results,regions)
report.update(sourceSha256=hashlib.sha256(board.read_bytes()).hexdigest(),emittedSurfaceSections=len(remove_traces),emittedViaSites=len(remove_vias),scope='Actual emitted saved control copper, actual fresh pour refill, all-stack vias/drills and terminal connectivity; no source geometry substituted.')
output.write_text(json.dumps(report,indent=2)+'\n')
print(f"Emitted controls: {report['physicalScreenPassedNets']}/{len(selected)} pass")
if not report['passed']:sys.exit(1)
