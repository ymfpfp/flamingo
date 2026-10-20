"""Check local buck copper, sense isolation and ground attachment; no routing.

Loop areas are centerline projections with a straight L2 connection between
return vias. They are layout metrics, not electromagnetic or thermal results.
"""
import copy, hashlib, json, math, sys
from pathlib import Path
from shapely.geometry import LineString,Point,Polygon,box
from shapely.ops import unary_union,substring

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'simulations/pcie-tx'))
from copper_geometry import copper_objects

def audit(j):
    if isinstance(j,dict):j=j['circuitJson']
    sc={e['name']:e for e in j if e['type']=='source_component'}
    sp={e['source_port_id']:e for e in j if e['type']=='source_port'}
    pp={e['pcb_port_id']:e for e in j if e['type']=='pcb_port'}
    st={e['source_trace_id']:e for e in j if e['type']=='source_trace'}
    traces={st.get(e.get('source_trace_id'),{}).get('name'):e for e in j if e['type']=='pcb_trace'}
    vias={e['pcb_via_id']:e for e in j if e['type']=='pcb_via'}
    parents={}
    def root(x):
        parents.setdefault(x,x)
        if parents[x]!=x:parents[x]=root(parents[x])
        return parents[x]
    def join(items):
        items=[x for x in items if x]
        for x in items[1:]:parents[root(x)]=root(items[0])
    for t in st.values():join(t.get('connected_source_port_ids',[])+t.get('connected_source_net_ids',[]))
    for c in sc.values():
        for group in c.get('internally_connected_source_port_ids',[]):join(group)
    for v in vias.values():
        join([pp[p].get('source_port_id') for p in v.get('pcb_port_ids',[])]+[v.get('source_net_id')]
            +st.get(v.get('source_trace_id'),{}).get('connected_source_port_ids',[]))
    def port(component,pin):
        source=next(p for p in sp.values() if p.get('source_component_id')==sc[component]['source_component_id'] and pin in p.get('port_hints',[]))
        return next(p for p in pp.values() if p.get('source_port_id')==source['source_port_id'])
    def net_port(p):return root(p['source_port_id'])
    def trace_net(t):
        s=st[t['source_trace_id']]
        return root((s.get('connected_source_port_ids',[])+s.get('connected_source_net_ids',[]))[0])
    def via_net(v):
        routed=pcb_traces.get(v.get('pcb_trace_id'),{})
        ids=[v.get('source_net_id')]+[pp[p].get('source_port_id') for p in v.get('pcb_port_ids',[])]+st.get(v.get('source_trace_id',routed.get('source_trace_id')),{}).get('connected_source_port_ids',[])
        return root(next(x for x in ids if x))
    gnd=root(next(e['source_net_id'] for e in j if e['type']=='source_net' and e['name']=='GND'))
    pcb_traces={e['pcb_trace_id']:e for e in j if e['type']=='pcb_trace'}
    pours={e['pcb_copper_pour_id']:e for e in j if e['type']=='pcb_copper_pour'}
    copper=[]
    for o in copper_objects(j):
        if o['port'] in pp:n=net_port(pp[o['port']])
        elif o['label'] in vias:n=via_net(vias[o['label']])
        elif o['trace'] in pcb_traces:n=trace_net(pcb_traces[o['trace']])
        elif o['label'] in pours:n=root(pours[o['label']]['source_net_id'])
        else:continue
        copper.append({**o,'net':n})
    def line(t):
        return unary_union([LineString([(a['x'],a['y']),(b['x'],b['y'])]) for a,b in zip(t['route'],t['route'][1:])
            if a['route_type']==b['route_type']=='wire' and a['layer']==b['layer'] and math.hypot(a['x']-b['x'],a['y']-b['y'])>1e-8])
    results=[];failures=[]
    for rail in ['VCCL','VDD']:
        prefix=f'BUCK_{rail}_'
        needed=['SW','VIN','INPUT_BULK','OUTPUT_A','OUTPUT_B','VOS','FB_SENSE','FB_INPUT','FB_DIVIDER','GND_IC','GND_HF']
        if any(prefix+n not in traces for n in needed):failures.append(f'{rail}: incomplete routed copper');continue
        center=next(e for e in j if e['type']=='pcb_component' and e.get('source_component_id')==sc[rail+'_BUCK']['source_component_id'])['center']
        window=box(center['x']-5.1,center['y']-4.9,center['x']+5.1,center['y']+7.6)
        terminals={
            'input':[port(rail+'_BUCK','VIN'),port(f'C_{rail}_HF','pin1'),port(f'C_{rail}_CIN','pin1')],
            'output':[port(f'L_{rail}','pin2'),port(f'C_{rail}_COUT','pin1'),port(f'C_{rail}_COUT_B','pin1')],
            'ground':[port(rail+'_BUCK','GND')]+[port(f'C_{rail}_{suffix}','pin2') for suffix in ['HF','CIN','COUT','COUT_B']]+[port(f'R_{rail}_{suffix}','pin2') for suffix in ['FBB','MODE']],
        }
        connected={}
        for label,points in terminals.items():
            net=net_port(points[0]);shape=unary_union([o['shape'] for o in copper if o['net']==net and 'top' in o['layers']]).intersection(window).buffer(1e-7)
            regions=list(shape.geoms) if shape.geom_type=='MultiPolygon' else [shape]
            region=next((r for r in regions if r.covers(Point(points[0]['x'],points[0]['y']))),None)
            connected[label]=region is not None and all(region.covers(Point(p['x'],p['y'])) for p in points)
            # Ground has three local patches, all joined by L2/L5. Every
            # terminal must belong to a patch that reaches a grounded via.
            if label=='ground':
                returns=[v for v in vias.values() if via_net(v)==gnd and 'inner1' in v['layers'] and 'inner4' in v['layers']]
                connected[label]=all(any(r.covers(Point(p['x'],p['y'])) and any(r.covers(Point(v['x'],v['y'])) for v in returns) for r in regions) for p in points)
                local_pours=unary_union([o['shape'] for o in copper if o['net']==gnd and o['label'] in pours and 'top' in o['layers']]).intersection(window)
                floating=[r.area for r in regions if r.intersection(local_pours).area>.001 and not any(r.covers(Point(v['x'],v['y'])) for v in returns)]
                if floating:failures.append(f'{rail}: floating local ground copper: {floating}')
            if not connected[label]:failures.append(f'{rail}: disconnected local {label} copper')
        sw_net=net_port(port(rail+'_BUCK','SW'))
        sw=unary_union([o['shape'] for o in copper if o['net']==sw_net and 'top' in o['layers']])
        sense=[]
        for suffix in ['VOS','FB_SENSE','FB_INPUT','FB_DIVIDER']:
            t=traces[prefix+suffix];path=line(t)
            # The VOS and SW lands have a fixed 0.5 mm pitch. Exclude only
            # the first 0.4 mm of the VOS pin launch from the isolation target.
            if suffix=='VOS':
                p=port(rail+'_BUCK','VOS');path=path.difference(Point(p['x'],p['y']).buffer(.4))
            distance=path.buffer(.15/2,quad_segs=16).distance(sw)
            sense.append({'name':prefix+suffix,'gapToSwitchCopperMm':distance})
            if distance<.5-1e-5:failures.append(f'{rail}: {suffix} is only {distance:.4f} mm from SW copper (project target 0.5 mm outside VOS launch)')
        vin=traces[prefix+'VIN']['route'];hf=port(f'C_{rail}_HF','pin2')
        ground_hf=traces[prefix+'GND_HF']['route'];ground_ic=traces[prefix+'GND_IC']['route']
        coords=[(p['x'],p['y']) for p in vin if p['route_type']=='wire']+[(hf['x'],hf['y'])]
        coords +=[(p['x'],p['y']) for p in reversed(ground_hf) if p['route_type']=='wire']
        coords +=[(p['x'],p['y']) for p in ground_ic if p['route_type']=='wire']
        area=Polygon(coords).area
        if area>4:failures.append(f'{rail}: projected HF loop area exceeds 4 mm2')
        results.append({'rail':rail,'connectedCopper':connected,'senseIsolation':sense,'hfLoopProjectionAreaMm2':area})
    return {'passed':not failures,'failures':failures,'results':results,
        'scope':'Physical top copper continuity for power, feedback isolation, grounded local regions and projected HF-loop area. Native fabrication DRC applies separately.',
        'limitations':'The loop metric assumes a straight connection between return vias in the reference plane. No EMI, thermal, transient, global-PDN or regulator-stability qualification.'}

if __name__=='__main__':
    file=Path(sys.argv[1]);raw=file.read_bytes();report=audit(json.loads(raw))
    report.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest())
    out=ROOT/'dist/buck-routing/layout-audit.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2))
    print('Buck physical copper and quiet-sense checks:',report['passed'])
    for f in report['failures']:print(f)
    if '--self-test' in sys.argv and report['passed']:
        changed=copy.deepcopy(json.loads(raw))
        if isinstance(changed,dict):changed=changed['circuitJson']
        sources={e['source_trace_id']:e for e in changed if e['type']=='source_trace'}
        sw=next(e for e in changed if e['type']=='pcb_trace' and sources.get(e.get('source_trace_id'),{}).get('name')=='BUCK_VCCL_SW')['route'][0]
        fb=next(e for e in changed if e['type']=='pcb_trace' and sources.get(e.get('source_trace_id'),{}).get('name')=='BUCK_VCCL_FB_INPUT')
        fb['route']=[{'route_type':'wire','x':sw['x'],'y':sw['y'],'width':.15,'layer':'top'},
            {'route_type':'wire','x':sw['x']+1,'y':sw['y'],'width':.15,'layer':'top'}]
        assert any('FB_INPUT is only' in f for f in audit(changed)['failures'])
        changed=copy.deepcopy(json.loads(raw))
        if isinstance(changed,dict):changed=changed['circuitJson']
        source=next(e for e in changed if e['type']=='source_component' and e['name']=='VCCL_BUCK')
        c=next(e for e in changed if e['type']=='pcb_component' and e.get('source_component_id')==source['source_component_id'])['center']
        ground=next(e['source_net_id'] for e in changed if e['type']=='source_net' and e['name']=='GND')
        changed.append({'type':'pcb_copper_pour','pcb_copper_pour_id':'buck-floating-regression','layer':'top','source_net_id':ground,
            'brep_shape':{'outer_ring':{'vertices':[{'x':c['x']+x,'y':c['y']+y} for x,y in [(-4.9,4.3),(-4.6,4.3),(-4.6,4.6),(-4.9,4.6)]]},'inner_rings':[]}})
        assert any('floating local ground' in f for f in audit(changed)['failures'])
        print('Buck regression checks: SW intrusion into feedback and floating ground rejected')
    sys.exit(0 if report['passed'] else 1)
