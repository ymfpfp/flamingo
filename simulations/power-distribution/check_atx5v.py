"""Check actual ATX 5 V copper, including barrels and the existing VIN loops."""
import copy,hashlib,json,sys
from pathlib import Path
from shapely.geometry import Point,box
from shapely.ops import unary_union
from check_layout import model,ROOT

def audit(raw):
    j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(raw)
    n=nets['V5V'];failures=[];regions=[]
    for layer in ['top','inner1','inner2','inner3','inner4','bottom']:
        shape=unary_union([o['shape'] for o in copper if o['net']==n and layer in o['layers']]).buffer(1e-7)
        regions.extend((layer,g) for g in getattr(shape,'geoms',[shape]) if not g.is_empty)
    parent=list(range(len(regions)))
    def find(i):
        if parent[i]!=i:parent[i]=find(parent[i])
        return parent[i]
    barrels=[(v['x'],v['y'],v['layers']) for v in vias.values() if via_net(v)==n]
    barrels +=[(p['x'],p['y'],p['layers']) for p in pp.values() if len(p['layers'])>1 and root(p.get('source_port_id',''))==n]
    for x,y,layers in barrels:
        touching=[i for i,(l,g) in enumerate(regions) if l in layers and g.covers(Point(x,y))]
        for i in touching[1:]:parent[find(i)]=find(touching[0])
    def contacts(p):return {find(i) for i,(l,g) in enumerate(regions) if l in p['layers'] and g.covers(Point(p['x'],p['y']))}
    origin=contacts(port('ATX','pin4'));terminals=[]
    for p in pp.values():
        s=sp.get(p.get('source_port_id'),{});part=sc.get(s.get('source_component_id'),{}).get('name')
        if not part or root(p['source_port_id'])!=n:continue
        pin=next((h for h in s['port_hints'] if h.startswith('pin')),s['port_hints'][0])
        name=part+'.'+pin;connected=bool(origin.intersection(contacts(p)))
        terminals.append(dict(name=name,connected=connected))
        if not connected:failures.append(name+': no physical path to ATX 5 V')
    floating=[g.area for i,(l,g) in enumerate(regions) if l=='inner3' and find(i) not in origin and g.area>.001]
    if floating:failures.append('ATX 5 V: floating L4 power copper '+str(floating))
    plane=unary_union([o['shape'] for o in copper if o['net']==n and 'inner3' in o['layers'] and o['label'] in pours])
    if plane.is_empty:failures.append('Missing L4 5 V power copper')
    # All five source contacts and both branch ends must share a 15 mil core.
    core=plane.buffer(-.381/2)
    targets=[port('ATX','pin'+str(p)) for p in [4,6,21,22,23]]+[port('C_'+r+'_CIN','pin1') for r in ['VCCL','VDD']]
    widthPass=any(all(g.covers(Point(p['x'],p['y'])) for p in targets) for g in getattr(core,'geoms',[core]))
    if not widthPass:failures.append('5 V feeder has no continuous 0.381 mm minimum-width path through all source and branch contacts')
    gaps=[plane.distance(o['shape']) for o in copper if o['net']!=n and 'inner3' in o['layers']]
    minimumGap=min(gaps,default=None)
    if minimumGap is not None and minimumGap<.2032-1e-5:failures.append(f'5 V L4 power spacing {minimumGap:.6f} mm < 0.2032 mm')
    if not box(.2,.2,52.3,123.42).buffer(1e-7).covers(plane):failures.append('5 V plane violates board-edge clearance')
    contactSources={e['pcb_trace_id'] for e in j if e['type']=='pcb_trace' and st.get(e.get('source_trace_id'),{}).get('name','').startswith('ATX5V_')}
    top=unary_union([o['shape'] for o in copper if o.get('trace') in contactSources])
    topGap=min((top.distance(o['shape']) for o in copper if 'top' in o['layers'] and o['net']!=n),default=None)
    if topGap is not None and topGap<.1-1e-5:failures.append('5 V top contact copper gap below 0.1 mm')
    if n in {nets['V5VSB'],nets['USB_VBUS']}:failures.append('Main ATX 5 V has merged with standby or USB VBUS')
    return dict(passed=not failures,failures=failures,terminals=terminals,connectedTerminals=sum(t['connected'] for t in terminals),
        floatingCopperMm2=floating,minimumL4PowerGapMm=minimumGap,minimumTopContactGapMm=topGap,continuous15MilCore=widthPass,
        scope='Physical continuity from all five ATX 5 V contacts to every 5 V load, through plated barrels and existing local VIN copper. L4 spacing, minimum-width core, floating copper and local contact clearance.')

if __name__=='__main__':
    file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw);result=audit(j)
    result.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest())
    out=ROOT/'dist/atx5v-routing';out.mkdir(parents=True,exist_ok=True);(out/'layout-audit.json').write_text(json.dumps(result,indent=2))
    print('ATX 5 V physical copper:',result['passed'])
    for f in result['failures']:print(f)
    if '--self-test' in sys.argv and result['passed']:
        bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
        net=next(e['source_net_id'] for e in bad if e['type']=='source_net' and e['name']=='V5V')
        bad=[e for e in bad if not(e['type']=='pcb_copper_pour' and e['layer']=='inner3' and e['source_net_id']==net)]
        assert not audit(bad)['passed'],'Missing ATX 5 V plane was not rejected'
        print('ATX 5 V regression: missing inner feed rejected')
        bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
        sources={e['source_trace_id']:e for e in bad if e['type']=='source_trace'}
        bad=[e for e in bad if not(e['type']=='pcb_via' and sources.get(e.get('source_trace_id'),{}).get('display_name','').startswith('ATX5V_VDD_'))]
        assert not audit(bad)['passed'],'Missing VDD input barrel connections were not rejected'
        print('ATX 5 V regression: missing VDD input vias rejected')
    sys.exit(0 if result['passed'] else 1)
