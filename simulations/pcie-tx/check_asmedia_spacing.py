"""Measure ASMedia PCIe S1 > 8h on emitted coupled routing.

The fixed BGA/pad and via launch regions are reported separately. They retain
fabrication DRC, but require the deferred 3D SI review. No routing is performed.
Run with the Python environment from simulations/pcie-tx/requirements.txt.
"""
from pathlib import Path
import copy, hashlib, json, math, sys
from shapely.geometry import LineString, Point, Polygon, box
from shapely.affinity import rotate
from shapely.ops import substring

ROOT=Path(__file__).resolve().parents[2]
CONTACTS={"TX":[('R20','R21','B14','B15'),('U20','U21','B19','B20'),('Y17','AA17','B23','B24'),('Y15','AA15','B27','B28')],
          "RX":[('N21','N20','A16','A17'),('W21','W20','A21','A22'),('Y19','AA19','A25','A26'),('AA13','Y13','A29','A30')]}

def audit(j):
    if isinstance(j,dict): j=j['circuitJson']
    stack=json.loads((ROOT/'manufacturing/stackup/JLC06161H-3313.json').read_text())
    required=8*stack['dielectrics'][0]['thicknessMm']
    comp={c['name']:c['source_component_id'] for c in j if c['type']=='source_component'}
    names={c['pcb_component_id']:next((s.get('name',c['pcb_component_id']) for s in j if s['type']=='source_component' and s['source_component_id']==c.get('source_component_id')),c['pcb_component_id']) for c in j if c['type']=='pcb_component'}
    sp=[p for p in j if p['type']=='source_port']; pp=[p for p in j if p['type']=='pcb_port']; traces=[t for t in j if t['type']=='pcb_trace']
    def port(component,pin):
        p=next(p for p in sp if p['source_component_id']==comp[component] and pin in p.get('port_hints',[]))
        return next(q for q in pp if q['source_port_id']==p['source_port_id'])
    def route(a,b):
        def match(t,p): return any(math.hypot(q['x']-p['x'],q['y']-p['y'])<1e-4 for q in [t['route'][0],t['route'][-1]])
        found=[t for t in traces if match(t,a) and match(t,b)]
        if len(found)!=1: raise ValueError(f'Expected exactly one physical route: {a} -> {b}')
        t=found[0]
        if math.hypot(t['route'][0]['x']-a['x'],t['route'][0]['y']-a['y'])<1e-4: return t
        # Native routing may store a connection in either direction. Normalize
        # pad-to-slot before applying the asymmetric launch distances.
        return {**t,'route':[{**p,**({'from_layer':p['to_layer'],'to_layer':p['from_layer']} if p['route_type']=='via' else {})} for p in reversed(t['route'])]}
    copper=[]
    def add(e,geom,layers,label,trace_id=None,port_id=None):
        copper.append({'shape':geom,'layers':layers,'label':label,'trace':trace_id,'port':port_id})
    for e in j:
        t=e['type']; label=names.get(e.get('pcb_component_id'),e.get('pcb_via_id',t))
        if t=='pcb_smtpad':
            x,y=e.get('x',0),e.get('y',0); shape=e['shape']
            label=f"{label}.{','.join(e.get('port_hints',[]))}"
            if shape=='circle': geom=Point(x,y).buffer(e['radius'],quad_segs=32)
            elif shape in ['pill','rotated_pill']:
                w,h=e['width'],e['height']; r=min(w,h)/2
                geom=LineString([(x-(w/2-r),y-(h/2-r)),(x+(w/2-r),y+(h/2-r))]).buffer(r,quad_segs=32)
                geom=rotate(geom,e.get('ccw_rotation',0),origin=(x,y))
            elif shape in ['rect','rotated_rect']:
                geom=box(x-e['width']/2,y-e['height']/2,x+e['width']/2,y+e['height']/2)
                geom=rotate(geom,e.get('ccw_rotation',0),origin=(x,y))
            elif shape=='polygon': geom=Polygon([(p['x'],p['y']) for p in e['points']])
            else: raise ValueError(f'Unsupported pad shape: {shape}')
            add(e,geom,[e['layer']],label,port_id=e.get('pcb_port_id'))
        elif t=='pcb_via': add(e,Point(e['x'],e['y']).buffer(e['outer_diameter']/2,quad_segs=32),e['layers'],label,trace_id=e.get('pcb_trace_id'))
        elif t=='pcb_trace':
            for a,b in zip(e['route'],e['route'][1:]):
                if a['route_type']==b['route_type']=='wire' and a['layer']==b['layer'] and math.hypot(a['x']-b['x'],a['y']-b['y'])>1e-8:
                    add(e,LineString([(a['x'],a['y']),(b['x'],b['y'])]).buffer(a['width']/2,quad_segs=16),[a['layer']],e['pcb_trace_id'],trace_id=e['pcb_trace_id'])
        elif t=='pcb_plated_hole':
            if e['shape']=='circle': geom=Point(e['x'],e['y']).buffer(e['outer_diameter']/2,quad_segs=32)
            elif e['shape']=='circular_hole_with_rect_pad':
                x,y=e['x'],e['y'];w,h=e['rect_pad_width'],e['rect_pad_height']
                geom=rotate(box(x-w/2,y-h/2,x+w/2,y+h/2),e.get('rect_ccw_rotation',0),origin=(x,y))
            elif e['shape']=='pill':
                x,y=e['x'],e['y'];w,h=e['outer_width'],e['outer_height'];r=min(w,h)/2
                geom=LineString([(x-(w/2-r),y-(h/2-r)),(x+(w/2-r),y+(h/2-r))]).buffer(r,quad_segs=32)
                geom=rotate(geom,e.get('ccw_rotation',0),origin=(x,y))
            else: raise ValueError(f'Unsupported plated hole: {e}')
            add(e,geom,['top','bottom'],label,port_id=e.get('pcb_port_id'))
        elif t=='pcb_copper_pour' and e['layer'] in ['top','bottom']:
            b=e['brep_shape']; geom=Polygon([(p['x'],p['y']) for p in b['outer_ring']['vertices']],
                [[(p['x'],p['y']) for p in r['vertices']] for r in b.get('inner_rings',[])])
            add(e,geom,[e['layer']],e['pcb_copper_pour_id'])
    def runs(trace):
        out=[]; points=[]; layer=None
        for p in trace['route']:
            if p['route_type']!='wire' or p['layer']!=layer:
                if len(points)>1: out.append((layer,LineString(points)))
                points=[]; layer=p.get('layer')
            if p['route_type']=='wire' and (not points or points[-1]!=(p['x'],p['y'])): points.append((p['x'],p['y']))
        if len(points)>1: out.append((layer,LineString(points)))
        return out
    results=[];excluded=[];launch_failures=[]
    for direction,contacts in CONTACTS.items():
        for lane,balls in enumerate(contacts):
            paths=[]; own_ports=set()
            for i,pol in enumerate('PN'):
                a=port('ASM2464PDX',balls[i]); b=port('PCIe',balls[i+2]); own_ports.update([a['pcb_port_id'],b['pcb_port_id']])
                if direction=='TX':
                    ci=port(f'C_TX{lane}_{pol}','pin1'); co=port(f'C_TX{lane}_{pol}','pin2'); own_ports.update([ci['pcb_port_id'],co['pcb_port_id']])
                    paths.extend([(f'TX{lane}_{pol} bridge',route(a,ci),'bridge'),(f'TX{lane}_{pol} connector',route(co,b),'connector')])
                else: paths.append((f'RX{lane}_{pol}',route(a,b),'rx'))
            own_traces={t['pcb_trace_id'] for _,t,_ in paths}
            obstacles=[o for o in copper if o['trace'] not in own_traces and (o['port'] is None or o['port'] not in own_ports)]
            for name,trace,stage in paths:
                for run_index,(layer,line) in enumerate(runs(trace)):
                    if direction=='TX' and stage=='bridge':
                        if layer!='bottom':
                            reason='BGA top pad-to-via escape' if run_index==0 else 'Capacitor top via-to-pad escape'
                            excluded.append({'name':name,'layer':layer,'lengthMm':line.length,'reason':reason})
                            if reason.startswith('BGA') and line.length>3.2: launch_failures.append(f'{name}: top BGA escape exceeds 3.2 mm project budget')
                            continue
                        before,after=3,1
                    elif stage=='connector': before,after=1,2
                    elif layer=='bottom': before,after=3,1
                    elif lane==3: before,after=3,2
                    elif run_index==0:
                        excluded.append({'name':name,'layer':layer,'lengthMm':line.length,'reason':'BGA top pad-to-via escape'})
                        if line.length>3.2: launch_failures.append(f'{name}: top BGA escape exceeds 3.2 mm project budget')
                        continue
                    else: before,after=1,2
                    if line.length<=before+after:
                        excluded.append({'name':name,'layer':layer,'lengthMm':line.length,'reason':'Overlapping via and slot launch regions'})
                        continue
                    trunk=substring(line,before,line.length-after).buffer(.1234/2,quad_segs=16)
                    local=[o for o in obstacles if layer in o['layers']]
                    closest=min(local,key=lambda o:trunk.distance(o['shape']))
                    gap=trunk.distance(closest['shape'])
                    # A 0.1 um guard covers polygonal circle approximation.
                    bad=[{'object':o['label'],'gapMm':trunk.distance(o['shape'])} for o in local if trunk.distance(o['shape'])<=required+0.0001]
                    results.append({'name':name,'layer':layer,'checkedLengthMm':line.length-before-after,
                        'minimumGapMm':gap,'closestObject':closest['label'],'violations':sorted(bad,key=lambda o:o['gapMm'])})
    return {'passed':not launch_failures and all(not r['violations'] for r in results),'requiredGapMm':required,'rule':'ASMedia PCIe Gen4 S1 > 8h; h = 0.0994 mm',
        'scope':'All foreign outer-layer copper, including ground, pads, vias and traces. Reference-plane copper is not an obstacle.',
        'launchRegionsMm':{'bottomAfterBgaVia':3,'viaOrCapacitor':1,'slotPad':2,'topBgaEscapeProjectMaximum':3.2},
        'excludedLaunchRuns':excluded,'launchFailures':launch_failures,
        'limitations':'The stated launch regions retain fabrication DRC but are not declared 8h compliant or impedance-qualified. Their fixed pad pitch requires final 3D SI review.',
        'results':results}

if __name__=='__main__':
    path=Path(sys.argv[1] if len(sys.argv)>1 else ROOT/'dist/pcie-tx-routing/board.circuit.json')
    raw=path.read_bytes();report=audit(json.loads(raw))
    report.update(sourceFile=str(path),sourceSha256=hashlib.sha256(raw).hexdigest())
    out=ROOT/'dist/pcie-rx-routing/asmedia-spacing.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2))
    print('ASMedia 8h coupled-route isolation:', 'passed' if report['passed'] else 'failed',f"(>{report['requiredGapMm']:.4f} mm)")
    for r in report['results']:
        if r['violations']: print(r['name'],r['layer'],json.dumps(r['violations'][:12]))
    for failure in report['launchFailures']: print(failure)
    if '--self-test' in sys.argv and report['passed']:
        changed=copy.deepcopy(json.loads(path.read_text()))
        if isinstance(changed,dict): changed=changed['circuitJson']
        source=next(e for e in changed if e['type']=='source_component' and e['name']=='C_VDD_1')
        component=next(e for e in changed if e['type']=='pcb_component' and e.get('source_component_id')==source['source_component_id'])
        dx,dy=22-component['center']['x'],92-component['center']['y']
        for pad in changed:
            if pad['type']=='pcb_smtpad' and pad.get('pcb_component_id')==component['pcb_component_id']:
                pad['x']+=dx;pad['y']+=dy;pad['layer']='top'
        regression=audit(changed)
        assert not regression['passed'], 'Isolation audit failed to detect the original capacitor-pad intrusion'
        assert any(r['name'].startswith('RX3') and r['violations'] for r in regression['results'])
        print('Isolation regression test: original top-side capacitor intrusion rejected')
    sys.exit(0 if report['passed'] else 1)
