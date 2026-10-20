"""Check emitted VCCH/VCCA33 copper and local ground returns. No routing."""
import copy,hashlib,json,sys
from pathlib import Path
from shapely.geometry import Point
from shapely.ops import unary_union
from check_layout import model,ROOT

def audit(raw):
    j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(raw)
    failures=[];records=[]
    def regions_for(net):
        regions=[]
        for layer in ['top','inner1','inner2','inner3','inner4','bottom']:
            shape=unary_union([o['shape'] for o in copper if o['net']==net and layer in o['layers']]).buffer(1e-7)
            regions.extend((layer,g) for g in getattr(shape,'geoms',[shape]) if not g.is_empty)
        parent=list(range(len(regions)))
        def find(i):
            if parent[i]!=i:parent[i]=find(parent[i])
            return parent[i]
        # Join only physical plated barrels, including through-hole connectors.
        barrels=[(v['x'],v['y'],v['layers']) for v in vias.values() if via_net(v)==net]
        barrels +=[(p['x'],p['y'],p['layers']) for p in pp.values() if len(p['layers'])>1 and root(p.get('source_port_id',''))==net]
        for x,y,layers in barrels:
            touching=[i for i,(l,g) in enumerate(regions) if l in layers and g.covers(Point(x,y))]
            for i in touching[1:]:parent[find(i)]=find(touching[0])
        def contacts(p):return {find(i) for i,(l,g) in enumerate(regions) if l in p['layers'] and g.covers(Point(p['x'],p['y']))}
        return regions,find,contacts
    for rail,feed in [('VCCH',('ATX','pin1')),('VCCA33',('R_VCCA33_4','pin2'))]:
        n=nets[rail];regions,find,contacts=regions_for(n);origin=contacts(port(*feed))
        expected=[p for p in pp.values() if p.get('source_port_id') in sp and sc.get(sp[p['source_port_id']].get('source_component_id'),{}).get('name')
            and root(p['source_port_id'])==n and not sc[sp[p['source_port_id']]['source_component_id']]['name'].startswith('source_manually')]
        disconnected=[]
        for p in expected:
            s=sp[p['source_port_id']];name=sc[s['source_component_id']]['name']+'.'+s['port_hints'][-1]
            if not origin.intersection(contacts(p)):disconnected.append(name)
        floating=[g.area for i,(l,g) in enumerate(regions) if l in ['inner2','inner3'] and find(i) not in origin and g.area>.001]
        if disconnected:failures.append(rail+': disconnected '+', '.join(disconnected))
        if floating:failures.append(rail+': floating power copper '+str(floating))
        bridge=[p for p in expected if sc[sp[p['source_port_id']]['source_component_id']]['name']=='ASM2464PDX']
        if len(bridge)!=(11 if rail=='VCCH' else 1):failures.append(rail+': wrong bridge supply ball count')
        records.append(dict(rail=rail,connectedTerminals=len(expected)-len(disconnected),bridgeBalls=len(bridge),disconnected=disconnected,floatingCopperMm2=floating))
    groundParts={'C_SPI_VCC','C_BUCK_EN','U_BUCK_EN','R_BUCK_EN_BOTTOM'}|{c['name'] for c in sc.values() if c['name'].startswith(('C_VCCH_','C_VCCA33_'))}
    regions,find,contacts=regions_for(nets['GND'])
    planeRoots={find(i) for i,(l,g) in enumerate(regions) if l in ['inner1','inner4']}
    groundCount=0
    for p in pp.values():
        s=sp.get(p.get('source_port_id'),{});part=sc.get(s.get('source_component_id'),{}).get('name')
        if part not in groundParts or root(s['source_port_id'])!=nets['GND']:continue
        groundCount+=1
        if not contacts(p).intersection(planeRoots):failures.append(part+': ground does not reach L2/L5 copper')
    # Prove the divider midpoint reaches SENSE through physical top copper.
    # Shared schematic net names alone cannot satisfy this check.
    senseNet=nets['VCCH_SENSE']
    senseCopper=unary_union([o['shape'] for o in copper if o['net']==senseNet and 'top' in o['layers']]).buffer(1e-7)
    senseRegions=list(getattr(senseCopper,'geoms',[senseCopper]))
    senseTerminals=[port('R_BUCK_EN_TOP','pin2'),port('R_BUCK_EN_BOTTOM','pin1'),port('U_BUCK_EN','SENSE')]
    senseConnected=any(all(g.covers(Point(p['x'],p['y'])) for p in senseTerminals) for g in senseRegions)
    if not senseConnected:failures.append('VCCH supervisor: divider midpoint does not physically reach all three top terminals')
    senseNames={'BUCK_MONITOR_DIVIDER','BUCK_MONITOR_SENSE'}
    senseIds={e['pcb_trace_id'] for e in j if e['type']=='pcb_trace' and st.get(e.get('source_trace_id'),{}).get('name') in senseNames}
    senseTraces=unary_union([o['shape'] for o in copper if o.get('trace') in senseIds])
    senseGap=min((senseTraces.distance(o['shape']) for o in copper if 'top' in o['layers'] and o['net']!=senseNet),default=float('inf'))
    if senseGap<.1-1e-5:failures.append(f'VCCH supervisor: sense copper gap {senseGap:.6f} mm < 0.1 mm')
    switchNets={root((t.get('connected_source_port_ids',[])+t.get('connected_source_net_ids',[]))[0]) for t in st.values() if t.get('name') in {'BUCK_VCCL_SW','BUCK_VDD_SW'}}
    switchGap=min((senseTraces.distance(o['shape']) for o in copper if 'top' in o['layers'] and o['net'] in switchNets),default=float('inf'))
    if switchGap<.5-1e-5:failures.append('VCCH supervisor: sense routing is within 0.5 mm of buck switching copper')
    reference=unary_union([o['shape'] for o in copper if o['net']==nets['GND'] and 'inner1' in o['layers'] and o['label'] in pours])
    referenceContinuous=reference.buffer(1e-7).covers(senseTraces)
    if not referenceContinuous:failures.append('VCCH supervisor: sense traces cross an L2 ground-plane opening')
    # Every new top contact retains actual foreign-copper clearance.
    traceSources={e['pcb_trace_id']:st.get(e.get('source_trace_id'),{}).get('name','') for e in j if e['type']=='pcb_trace'}
    gaps=[]
    for o in copper:
        if 'top' not in o['layers'] or not traceSources.get(o.get('trace'),'').startswith('VCCH_'):continue
        for other in copper:
            if 'top' not in other['layers'] or other['net']==o['net']:continue
            gap=o['shape'].distance(other['shape']);gaps.append(gap)
            if gap<.1-1e-5:failures.append(f"{o['label']} to {other['label']}: top contact gap {gap:.6f} mm < 0.1 mm")
    board=next(e for e in j if e['type']=='pcb_board')
    from shapely.geometry import box
    boundary=box(board['center']['x']-board['width']/2,board['center']['y']-board['height']/2,board['center']['x']+board['width']/2,board['center']['y']+board['height']/2)
    for o in copper:
        if o['net'] in [nets['VCCH'],nets['VCCA33']] and o['label'] in pours and not boundary.buffer(-.2+1e-6).covers(o['shape']):failures.append(o['label']+': board edge clearance below 0.2 mm')
    return dict(passed=not failures,failures=failures,rails=records,checkedGroundTerminals=groundCount,minimumTopContactCopperGapMm=min(gaps,default=None),
        supervisorSense=dict(connected=senseConnected,physicalTerminals=3,minimumForeignCopperGapMm=senseGap,minimumSwitchCopperGapMm=switchGap,continuousL2Ground=referenceContinuous),
        scope='Physical ATX-to-all-VCCH continuity; analog feed link-to-H5 and both analog bypasses; local grounds, supervisor divider-to-SENSE continuity, quiet routing, floating inner copper and top contact clearance.',
        limitations='Layout checks only. PDX load current, voltage at the package, AC PDN, transient and thermal qualification remain open.')

if __name__=='__main__':
    file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw);result=audit(j)
    result.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest())
    out=ROOT/'dist/vcch-routing';out.mkdir(parents=True,exist_ok=True)
    (out/'layout-audit.json').write_text(json.dumps(result,indent=2))
    print('VCCH/VCCA33 physical copper:',result['passed'])
    for f in result['failures']:print(f)
    if '--self-test' in sys.argv and result['passed']:
        bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
        st={e['source_trace_id']:e for e in bad if e['type']=='source_trace'}
        bad=[e for e in bad if not(e['type']=='pcb_trace' and st.get(e.get('source_trace_id'),{}).get('name')=='VCCH_BGA_H5_TRACE')]
        assert not audit(bad)['passed'],'Missing analog contact was not rejected'
        print('VCCH regression: missing H5 analog feed rejected')
        bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
        st={e['source_trace_id']:e for e in bad if e['type']=='source_trace'}
        bad=[e for e in bad if not(e['type']=='pcb_trace' and st.get(e.get('source_trace_id'),{}).get('name')=='BUCK_MONITOR_SENSE')]
        assert not audit(bad)['passed'],'Missing supervisor sense branch was not rejected'
        print('VCCH regression: missing supervisor sense branch rejected')
    sys.exit(0 if result['passed'] else 1)
