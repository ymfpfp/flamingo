"""Verify emitted VCCL/VDD distribution copper; this module performs no routing."""
import copy, hashlib, json, math, sys
from pathlib import Path
from collections import defaultdict
from shapely.geometry import Point, Polygon, LineString, box
from shapely.ops import unary_union
from shapely.affinity import rotate
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'simulations/pcie-tx'))
from copper_geometry import copper_objects

def model(j):
    if isinstance(j,dict):j=j['circuitJson']
    sc={e['source_component_id']:e for e in j if e['type']=='source_component'}
    sp={e['source_port_id']:e for e in j if e['type']=='source_port'}
    pp={e['pcb_port_id']:e for e in j if e['type']=='pcb_port'}
    st={e['source_trace_id']:e for e in j if e['type']=='source_trace'}
    pts={e['pcb_trace_id']:e for e in j if e['type']=='pcb_trace'}
    vias={e['pcb_via_id']:e for e in j if e['type']=='pcb_via'}
    pours={e['pcb_copper_pour_id']:e for e in j if e['type']=='pcb_copper_pour'}
    parent={}
    def root(x):
        parent.setdefault(x,x)
        if parent[x]!=x:parent[x]=root(parent[x])
        return parent[x]
    def join(xs):
        xs=[x for x in xs if x]
        for x in xs[1:]:parent[root(x)]=root(xs[0])
    for t in st.values():join(t.get('connected_source_port_ids',[])+t.get('connected_source_net_ids',[]))
    for c in sc.values():
        for group in c.get('internally_connected_source_port_ids',[]):join(group)
    for v in vias.values():join([pp[p].get('source_port_id') for p in v.get('pcb_port_ids',[])]+[v.get('source_net_id')]+st.get(v.get('source_trace_id'),{}).get('connected_source_port_ids',[]))
    nets={e['name']:root(e['source_net_id']) for e in j if e['type']=='source_net'}
    def via_net(v):
        t=st.get(v.get('source_trace_id',pts.get(v.get('pcb_trace_id'),{}).get('source_trace_id')), {})
        ids=[v.get('source_net_id')]+t.get('connected_source_port_ids',[])+[pp[p].get('source_port_id') for p in v.get('pcb_port_ids',[])]
        return root(next(x for x in ids if x))
    def trace_net(t):
        s=st[t['source_trace_id']]
        return root((s.get('connected_source_port_ids',[])+s.get('connected_source_net_ids',[]))[0])
    copper=[]
    for o in copper_objects(j):
        if o['port'] in pp:n=root(pp[o['port']]['source_port_id'])
        elif o['label'] in vias:n=via_net(vias[o['label']])
        elif o['trace'] in pts:n=trace_net(pts[o['trace']])
        elif o['label'] in pours:n=root(pours[o['label']]['source_net_id'])
        else:continue
        copper.append({**o,'net':n})
    for p in pours.values():
        if p['layer'] in ['top','bottom']:continue
        b=p['brep_shape'];shape=Polygon([(v['x'],v['y']) for v in b['outer_ring']['vertices']],
            [[(v['x'],v['y']) for v in r['vertices']] for r in b.get('inner_rings',[])])
        copper.append({'label':p['pcb_copper_pour_id'],'layers':[p['layer']],'shape':shape,'net':root(p['source_net_id']),'port':None,'trace':None})
    def port(part,pin):
        s=next(p for p in sp.values() if sc.get(p.get('source_component_id'),{}).get('name')==part and pin in p.get('port_hints',[]))
        return next(p for p in pp.values() if p.get('source_port_id')==s['source_port_id'])
    return j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port

def audit(j):
    j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(j)
    failures=[];records=[];layers={'VCCL':'inner2','VDD':'inner3'}
    assembled=[e for e in j if e['type']=='pcb_component' and e.get('source_component_id') in sc]
    for p in assembled:
        if p['layer']!='top':failures.append(sc[p['source_component_id']]['name']+': assembled off top')
    for rail,layer in layers.items():
        n=nets[rail];feed=port('L_'+rail,'pin2')
        # Conductive geometry is joined only by physical overlap and plated
        # vias. A shared schematic net never substitutes for PCB continuity.
        regions=[]
        for l in ['top','inner1','inner2','inner3','inner4','bottom']:
            shape=unary_union([o['shape'] for o in copper if o['net']==n and l in o['layers']]).buffer(1e-7)
            for p in getattr(shape,'geoms',[shape]):
                if not p.is_empty:regions.append((l,p))
        edges=list(range(len(regions)))
        def find(x):
            if edges[x]!=x:edges[x]=find(edges[x])
            return edges[x]
        for v in vias.values():
            if via_net(v)!=n:continue
            point=Point(v['x'],v['y'])
            touching=[i for i,(l,s) in enumerate(regions) if l in v['layers'] and s.covers(point)]
            for i in touching[1:]:edges[find(i)]=find(touching[0])
        origin=next((i for i,(l,s) in enumerate(regions) if l=='top' and s.covers(Point(feed['x'],feed['y']))),None)
        expected=[]
        for p in pp.values():
            s=sp.get(p.get('source_port_id'),{});part=sc.get(s.get('source_component_id'),{}).get('name','')
            if part=='ASM2464PDX' and rail in s.get('port_hints',[]):expected.append((part+'.'+s['port_hints'][-1],p))
            elif part.startswith('C_'+rail+'_') and part.split('_')[-1].isdigit() and 'pin1' in s.get('port_hints',[]):expected.append((part+'.pin1',p))
        disconnected=[name for name,p in expected if origin is None or not any(l=='top' and s.covers(Point(p['x'],p['y'])) and find(i)==find(origin) for i,(l,s) in enumerate(regions))]
        failures +=[rail+': disconnected '+name for name in disconnected]
        plane=unary_union([o['shape'] for o in copper if o['net']==n and layer in o['layers'] and o['label'] in pours])
        if plane.is_empty:failures.append(rail+': missing assigned inner power region')
        floating=[s.area for i,(l,s) in enumerate(regions) if l in ['inner2','inner3'] and origin is not None and find(i)!=find(origin) and s.area>.001]
        if floating:failures.append(rail+': floating inner copper '+str(floating))
        floating_top=[s.area for i,(l,s) in enumerate(regions) if l=='top' and origin is not None and find(i)!=find(origin) and s.area>.001]
        if floating_top:failures.append(rail+': floating top copper '+str(floating_top))
        records.append({'rail':rail,'layer':layer,'bridgePins':sum(name.startswith('ASM') for name,p in expected),
            'bypassPins':sum(not name.startswith('ASM') for name,p in expected),'disconnected':disconnected,'planeAreaMm2':plane.area,'floatingCopperMm2':floating,'floatingTopCopperMm2':floating_top})
    # Verify each bypass ground and all bridge GND/GNDA pins physically reach
    # either reference plane through a top copper region and a grounded via.
    n=nets['GND'];top=unary_union([o['shape'] for o in copper if o['net']==n and 'top' in o['layers']]).buffer(1e-7)
    ground_regions=list(getattr(top,'geoms',[top]))
    returns=[v for v in vias.values() if via_net(v)==n and 'inner1' in v['layers'] and 'inner4' in v['layers']]
    for p in pp.values():
        s=sp.get(p.get('source_port_id'),{});part=sc.get(s.get('source_component_id'),{}).get('name','');h=s.get('port_hints',[])
        selected=part=='ASM2464PDX' and any(x in h for x in ['GND','GNDA']) or (part.startswith(('C_VCCL_','C_VDD_')) and part.split('_')[-1].isdigit() and 'pin2' in h)
        if selected and not any(r.covers(Point(p['x'],p['y'])) and any(r.covers(Point(v['x'],v['y'])) for v in returns) for r in ground_regions):failures.append(part+'.'+h[-1]+': no physical GND return')
    drill=[];pth=[];mechanical=[];new_top=[];edge=[]
    board=next(e for e in j if e['type']=='pcb_board')
    boundary=Polygon([(p['x'],p['y']) for p in board['outline']]) if board.get('outline') else box(
        board['center']['x']-board['width']/2,board['center']['y']-board['height']/2,
        board['center']['x']+board['width']/2,board['center']['y']+board['height']/2)
    for o in copper:
        if o['net'] not in [nets['VCCL'],nets['VDD']] or o['label'] not in pours:continue
        if not boundary.buffer(-.2+1e-6).covers(o['shape']):failures.append(o['label']+': power copper violates the 0.2 mm board-edge clearance')
        edge.append(boundary.boundary.distance(o['shape']))
    # Every outer power region/trace retains the general copper clearance.
    # Existing signal-specific 8h shielding is checked by its own audits.
    for o in copper:
        if o['net'] not in [nets['VCCL'],nets['VDD']] or 'top' not in o['layers']:continue
        if o['trace'] and not st.get(next((e.get('source_trace_id') for e in j if e.get('pcb_trace_id')==o['trace'] and e['type']=='pcb_trace'),None),{}).get('name','').startswith('PDN_'):continue
        if o['port'] or o['label'] in vias:continue
        for other in copper:
            if other['net']==o['net'] or 'top' not in other['layers']:continue
            gap=o['shape'].distance(other['shape']);new_top.append(gap)
            if gap<.1-1e-5:failures.append(f"{o['label']} to {other['label']}: top power copper gap {gap:.6f} mm < 0.1 mm")
    for o in copper:
        if not any(l in o['layers'] for l in ['inner1','inner2','inner3','inner4']) or o['label'] not in pours:continue
        for v in vias.values():
            if via_net(v)==o['net']:continue
            gap=o['shape'].distance(Point(v['x'],v['y']))-v['hole_diameter']/2
            drill.append(gap)
            if gap<.2-1e-5:failures.append(f"{o['label']} to {v['pcb_via_id']}: inner drill gap {gap:.6f} mm < 0.2 mm")
        for h in j:
            if h['type']=='pcb_hole' and h.get('hole_shape','circle')=='circle':
                gap=o['shape'].distance(Point(h['x'],h['y']))-h.get('hole_diameter',h.get('diameter',0))/2
                mechanical.append(gap)
                if gap<.2-1e-5:failures.append(f"{o['label']} to {h['pcb_hole_id']}: mechanical hole clearance below 0.2 mm")
            if h['type']!='pcb_plated_hole' or root(pp.get(h.get('pcb_port_id'),{}).get('source_port_id',h['pcb_plated_hole_id']))==o['net']:continue
            if h['shape'] in ['circle','circular_hole_with_rect_pad']:
                hole_shape=Point(h['x'],h['y']).buffer(h['hole_diameter']/2)
            elif h['shape']=='pill':
                x,y=h['x'],h['y'];w,ht=h['hole_width'],h['hole_height'];r=min(w,ht)/2
                line=LineString([(x-(w/2-r),y-(ht/2-r)),(x+(w/2-r),y+(ht/2-r))])
                hole_shape=rotate(line.buffer(r),h.get('ccw_rotation',0),origin=(x,y))
            else:raise ValueError('Unsupported inner PTH drill geometry')
            gap=o['shape'].distance(hole_shape);pth.append(gap)
            if gap<.3-1e-5:failures.append(f"{o['label']} to {h['pcb_plated_hole_id']}: inner plated drill gap {gap:.6f} mm < 0.3 mm")
    return {'passed':not failures,'failures':failures,'rails':records,'assembledComponentsOnTop':len(assembled),
        'minimumForeignViaDrillToInnerCopperMm':min(drill,default=None),
        'minimumForeignPlatedDrillToInnerCopperMm':min(pth,default=None),'minimumMechanicalHoleToInnerCopperMm':min(mechanical,default=None),
        'minimumTopPowerCopperGapMm':min(new_top,default=None),
        'minimumPowerPourToBoardEdgeMm':min(edge,default=None),
        'scope':'Emitted rail copper, feed-to-every-ball and bypass continuity, bridge and bypass ground returns, and inner via drill clearance.',
        'limitations':'No package model, AC PDN impedance, regulator transient or thermal qualification.'}

if __name__=='__main__':
    file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw);report=audit(j)
    report.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest())
    out=ROOT/'dist/power-distribution/layout-audit.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2))
    print('VCCL/VDD power distribution copper:',report['passed'])
    for f in report['failures']:print(f)
    if '--self-test' in sys.argv and report['passed']:
        bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
        n=next(e['source_net_id'] for e in bad if e['type']=='source_net' and e['name']=='VDD')
        bad=[e for e in bad if not(e['type']=='pcb_copper_pour' and e['layer']=='inner3' and e['source_net_id']==n)]
        assert not audit(bad)['passed'],'Missing VDD plane was not rejected'
        print('PDN regression: missing distribution plane rejected')
        bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
        sources={e['source_trace_id']:e for e in bad if e['type']=='source_trace'}
        removed={e['pcb_via_id'] for e in bad if e['type']=='pcb_via' and sources.get(e.get('source_trace_id'),{}).get('display_name')=='PDN_C_VDD_1_pin2 connectivity'}
        assert removed,'Missing negative-fixture ground contact'
        bad=[e for e in bad if not(e['type']=='pcb_via' and e['pcb_via_id'] in removed)]
        assert not audit(bad)['passed'],'Missing bypass ground via was not rejected'
        print('PDN regression: missing bypass return rejected')
        bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
        n=next(e['source_net_id'] for e in bad if e['type']=='source_net' and e['name']=='VDD')
        floating=copy.deepcopy(next(e for e in bad if e['type']=='pcb_copper_pour' and e['source_net_id']==n and e['layer']=='top'))
        floating.update(pcb_copper_pour_id='regression_floating_vdd_top',brep_shape={
            'outer_ring':{'vertices':[{'x':x,'y':y} for x,y in [(45.1,79.1),(45.3,79.1),(45.3,79.3),(45.1,79.3)]]},'inner_rings':[]})
        bad.append(floating)
        assert any('floating top copper' in f for f in audit(bad)['failures']),'Floating top power island was not rejected'
        print('PDN regression: floating top power island rejected')
    sys.exit(0 if report['passed'] else 1)
