"""Check emitted USB4 coupled geometry and ASMedia outer copper isolation.

Fixed BGA and component/connector launches retain fabrication DRC and need the
final SI review. No routing or path search is performed by this checker.
"""
import copy, hashlib, json, math, subprocess, sys
from pathlib import Path
from shapely.geometry import LineString, Point, box
from shapely.affinity import rotate
from shapely.ops import substring, unary_union

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'simulations/pcie-tx'))
from copper_geometry import copper_objects

def audit(j, isolation_regions=None):
    if isinstance(j,dict): j=j['circuitJson']
    stack=json.loads((ROOT/'manufacturing/stackup/selected.json').read_text())
    profile=stack['impedanceProfiles'][0]
    width=profile['calculatedTraceWidthMm']; gap=profile['calculatedPairGapMm']
    required=8*stack['dielectrics'][0]['thicknessMm']
    src={s['source_trace_id']:s for s in j if s['type']=='source_trace'}
    traces={src[t['source_trace_id']]['name']:t for t in j if t['type']=='pcb_trace'
        and t.get('source_trace_id') in src and src[t['source_trace_id']].get('name','').startswith(('USB4_','USB2_'))}
    sources={c['source_component_id']:c.get('name') for c in j if c['type']=='source_component'}
    sp={p['source_port_id']:p for p in j if p['type']=='source_port'}
    pp={p['pcb_port_id']:p for p in j if p['type']=='pcb_port'}
    copper=copper_objects(j)
    # Bound the fixed launch envelopes by the actual component courtyards.
    # BGA necks, connector pad fields and via/pad transitions are disclosed
    # separately; fabrication DRC still applies inside every envelope.
    pcb_components={c['source_component_id']:c for c in j if c['type']=='pcb_component'}
    bridge=next(c for sid,c in pcb_components.items() if sources.get(sid)=='ASM2464PDX')
    courtyard=next(c for c in j if c['type']=='pcb_courtyard_rect' and c['pcb_component_id']==bridge['pcb_component_id'])
    bc=courtyard['center'];bga_launch=box(bc['x']-courtyard['width']/2-.5,bc['y']-courtyard['height']/2-.5,
        bc['x']+courtyard['width']/2+.5,bc['y']+courtyard['height']/2+.5)
    connector=next(c for sid,c in pcb_components.items() if sources.get(sid)=='USBC')
    cc=connector['center']; connector_launch=box(cc['x']-connector['width']/2-1.25,cc['y']-connector['height']/2-1.25,
        cc['x']+connector['width']/2+1.25,cc['y']+connector['height']/2+1.25)
    results=[]; excluded=[];coupling=[];routing_failures=[]
    for pair in ['TX1','TX2','RX1','RX2','USB2']:
        prefix='USB2_' if pair=='USB2' else f'USB4_{pair}_'
        local_required=.381 if pair=='USB2' else required
        own={t['pcb_trace_id'] for name,t in traces.items() if name.startswith(prefix)}
        own_ports=set()
        for padid,p in pp.items():
            s=sp.get(p['source_port_id'],{}); component=sources.get(s.get('source_component_id'),'')
            if component in [f'{role}_USB_{pair}_{pol}' for role in 'CDR' for pol in 'PN'] and s.get('name') not in ['pin2','2']:
                own_ports.add(padid)
        # Each source trace's endpoints identify exactly the signal pads, also
        # including the bridge and connector without exempting shunt grounds.
        for name,t in traces.items():
            if not name.startswith(prefix): continue
            for pid,p in pp.items():
                if p['source_port_id'] in src[t['source_trace_id']]['connected_source_port_ids']: own_ports.add(pid)
        obstacles=[o for o in copper if o['trace'] not in own and o['port'] not in own_ports]
        for pol in 'PN':
            for stage in (['TRUNK','RECEPTACLE'] if pair=='USB2' else ['PHY_A','PHY_B','CON_A','CON_B']):
                name=f'{prefix}{pol}_{stage}'
                if name not in traces: raise ValueError(f'Missing {name}')
                t=traces[name]; route=t['route']
                # Normalize connector routes to run resistor -> connector.
                if stage=='CON_B':
                    first=next((p for p in pp.values() if math.hypot(p['x']-route[0]['x'],p['y']-route[0]['y'])<1e-5
                        and sources.get(sp.get(p['source_port_id'],{}).get('source_component_id'))=='USBC'),None)
                    if first: route=list(reversed(route))
                runs=[];points=[];layer=None
                for p in route:
                    if p['route_type']!='wire' or p['layer']!=layer:
                        if len(points)>1: runs.append((layer,LineString(points)))
                        points=[];layer=p.get('layer')
                    if p['route_type']=='wire' and (not points or points[-1]!=(p['x'],p['y'])):points.append((p['x'],p['y']))
                if len(points)>1:runs.append((layer,LineString(points)))
                for i,(layer,line) in enumerate(runs):
                    before=3 if stage in ['PHY_A','TRUNK'] and i==0 else 1
                    after=1.1 if stage in ['PHY_A','TRUNK'] else 2
                    if stage in ['PHY_B','CON_A','RECEPTACLE'] or line.length<=before+after:
                        excluded.append({'name':name,'layer':layer,'lengthMm':line.length,'reason':'Fixed pad/via launch'})
                        continue
                    trunk=substring(line,before,line.length-after).buffer(width/2,quad_segs=16).difference(bga_launch).difference(connector_launch)
                    if trunk.is_empty:
                        excluded.append({'name':name,'layer':layer,'lengthMm':line.length,'reason':'Fixed component courtyard launch envelope'})
                        continue
                    if isolation_regions is not None:
                        isolation_regions.append({'name':name,'traceId':t['pcb_trace_id'],'layer':layer,'requiredGapMm':local_required,'shape':trunk})
                    local=[o for o in obstacles if layer in o['layers']]
                    closest=min(local,key=lambda o:trunk.distance(o['shape']))
                    bad=[{'object':o['label'],'gapMm':trunk.distance(o['shape'])} for o in local
                        if trunk.distance(o['shape'])<=local_required+.0001]
                    results.append({'name':name,'layer':layer,'checkedLengthMm':line.length-before-after,
                        'minimumGapMm':trunk.distance(closest['shape']),'requiredGapMm':local_required,'closestObject':closest['label'],
                        'violations':sorted(bad,key=lambda b:b['gapMm'])})
                    mate=traces[name.replace(f'_{pol}_',f'_{"N" if pol=="P" else "P"}_')]
                    mate_lines=[LineString([(a['x'],a['y']),(b['x'],b['y'])]) for a,b in zip(mate['route'],mate['route'][1:])
                        if a['route_type']==b['route_type']=='wire' and a['layer']==b['layer']==layer
                        and math.hypot(a['x']-b['x'],a['y']-b['y'])>1e-8]
                    mate_geometry=unary_union(mate_lines)
                    n=max(1,math.ceil((line.length-before-after)/.01));ds=(line.length-before-after)/n
                    bad_length=0;checked=0
                    for k in range(n):
                        p=line.interpolate(before+(k+.5)*ds)
                        if bga_launch.covers(p) or connector_launch.covers(p):continue
                        actual_gap=p.distance(mate_geometry)-width
                        checked+=ds
                        if actual_gap<gap-.0002 or actual_gap>(width+gap)/math.cos(math.pi/8)-width+.0002:bad_length+=ds
                    coupling.append({'name':name,'layer':layer,'checkedLengthMm':checked,'badLengthMm':bad_length})
                    if stage=='PHY_A':
                        headings=[]
                        for a,b in zip(line.coords,line.coords[1:]):
                            segment=LineString([a,b])
                            if bga_launch.covers(segment) or connector_launch.covers(segment):continue
                            if b[0]<a[0]-.0001:routing_failures.append(f'{name}: backwards-running main copper')
                            if abs(b[1]-a[1])>.0001:headings.append(1 if b[1]>a[1] else -1)
                        if sum(a!=b for a,b in zip(headings,headings[1:]))>1:routing_failures.append(f'{name}: repeated serpentine turns')
    ground_net=next(n for n in j if n['type']=='source_net' and n['name']=='GND')
    gnd=ground_net['source_net_id']
    def is_ground_via(v):
        # Explicit vias can connect through a named component port rather
        # than directly to net.GND. Resolve that native connectivity too.
        return v.get('source_net_id')==gnd or any(
            sp.get(pid,{}).get('subcircuit_connectivity_map_key')==ground_net['subcircuit_connectivity_map_key']
            for pid in src.get(v.get('source_trace_id'),{}).get('connected_source_port_ids',[]))
    ground_vias=[v for v in j if v['type']=='pcb_via' and is_ground_via(v)]
    authored=json.loads(subprocess.check_output(['bun','-e','import {usbShieldFences,usbGuardBands} from "./lib/usb-shielding"; console.log(JSON.stringify({fences:usbShieldFences,bands:usbGuardBands}));'],cwd=ROOT,text=True))
    fences=authored['fences']
    fence_pitch=max(math.hypot(a['x']-b['x'],a['y']-b['y']) for row in fences for a,b in zip(row,row[1:]))
    if fence_pitch>1.016:routing_failures.append('Ground fence exceeds the ASMedia 40 mil hole pitch')
    for p in [p for row in fences for p in row]:
        if not any(math.hypot(p['x']-v['x'],p['y']-v['y'])<1e-5 and 'inner1' in v['layers'] and 'inner4' in v['layers'] for v in ground_vias):
            routing_failures.append(f'Missing full-stack ground fence via at {p}')
    ground_pours={p['pcb_copper_pour_id'] for p in j if p['type']=='pcb_copper_pour' and p.get('source_net_id')==gnd}
    outer_pours=[o for o in copper if o['label'] in ground_pours and any(l in o['layers'] for l in ['top','bottom'])]
    # Adjacent authored bands can overlap. Check the actual connected copper
    # on each layer, rather than requiring a separate via in every source polygon.
    surfaces={layer:unary_union([o['shape'] for o in outer_pours if layer in o['layers']]) for layer in ['top','bottom']}
    # Small BGA ground straps can reach a reference via through a ground trace
    # and pad. Include that emitted copper when testing physical grounding;
    # retain the guard-band-only surfaces for the stitching-pitch checks below.
    ground_ports={p['pcb_port_id'] for p in j if p['type']=='pcb_port'
        and sp.get(p.get('source_port_id'),{}).get('subcircuit_connectivity_map_key')==ground_net['subcircuit_connectivity_map_key']}
    ground_traces={p['pcb_trace_id'] for p in j if p['type']=='pcb_trace' and (
        p.get('source_trace_id')==gnd or gnd in src.get(p.get('source_trace_id'),{}).get('connected_source_net_ids',[])
        or any(sp.get(pid,{}).get('subcircuit_connectivity_map_key')==ground_net['subcircuit_connectivity_map_key']
            for pid in src.get(p.get('source_trace_id'),{}).get('connected_source_port_ids',[])))}
    ground_via_ids={v['pcb_via_id'] for v in ground_vias}
    conductors={layer:unary_union([o['shape'] for o in copper if layer in o['layers'] and (
        o['label'] in ground_pours or o['label'] in ground_via_ids or o['port'] in ground_ports or o['trace'] in ground_traces)]).buffer(1e-7)
        for layer in ['top','bottom']}
    shielding=[]
    for layer,surface in surfaces.items():
        for i,shape in enumerate(getattr(surface,'geoms',[surface])):
            if shape.is_empty:continue
            connected=next((r for r in getattr(conductors[layer],'geoms',[conductors[layer]]) if r.intersects(shape)),shape)
            shielding.append({'pour':f'{layer}_guard_{i}','layer':layer,'areaMm2':shape.area,
                'groundViaCount':sum(layer in v['layers'] and connected.intersects(Point(v['x'],v['y']).buffer(v['outer_diameter']/2)) for v in ground_vias)})
    for row in fences:
        for p in row:
            via=next((v for v in ground_vias if math.hypot(p['x']-v['x'],p['y']-v['y'])<1e-5),None)
            if via is None:continue
            if not any(surface.intersects(Point(p['x'],p['y']).buffer(via['outer_diameter']/2)) for surface in surfaces.values()):
                routing_failures.append(f'Ground fence via at {p} does not contact a surface guard band')
    guard_pitch=[]
    for band in authored['bands']:
        line=LineString([(p['x'],p['y']) for p in band['centerline']])
        for layer in band['layers']:
            emitted=line.intersection(surfaces[layer].buffer(1e-5))
            for run in getattr(emitted,'geoms',[emitted]):
                if run.geom_type!='LineString' or run.length<1e-5:continue
                stations=[run.project(Point(v['x'],v['y'])) for v in ground_vias
                    if layer in v['layers'] and run.distance(Point(v['x'],v['y']))<=band['nominalWidthMm']/2+v['outer_diameter']/2
                    and surfaces[layer].intersects(Point(v['x'],v['y']).buffer(v['outer_diameter']/2))]
                stations=sorted([0,run.length]+stations)
                largest=max(b-a for a,b in zip(stations,stations[1:]))
                guard_pitch.append({'band':band['name'],'layer':layer,'maximumUnstitchedRunMm':largest})
                if largest>1.016+1e-5:routing_failures.append(f"{layer} {band['name']} guard has {largest:.4f} mm between stitching contacts")
    # Same-net copper contact never permits overlapping physical drills. Check
    # rotated USB-C mounting slots as well as copper-to-copper DRC.
    drill_clearances=[]
    drill_minimum=json.loads((ROOT/'jlcpcb-clearance-rules.json').read_text())['minimumMm']['pthDrillToDrill']
    for hole in [e for e in j if e['type']=='pcb_plated_hole']:
        x,y=hole['x'],hole['y']
        if 'hole_diameter' in hole:drill=Point(x,y).buffer(hole['hole_diameter']/2,quad_segs=64)
        else:
            w,h=hole['hole_width'],hole['hole_height'];r=min(w,h)/2
            drill=LineString([(x-(w/2-r),y-(h/2-r)),(x+(w/2-r),y+(h/2-r))]).buffer(r,quad_segs=64)
            drill=rotate(drill,hole.get('ccw_rotation',0),origin=(x,y))
        for via in [e for e in j if e['type']=='pcb_via' and 34<e['x']<48 and 92<e['y']<106]:
            distance=drill.distance(Point(via['x'],via['y']).buffer(via['hole_diameter']/2,quad_segs=64))
            if distance<1:
                drill_clearances.append({'via':via['pcb_via_id'],'hole':hole['pcb_plated_hole_id'],'gapMm':distance,'minimumMm':drill_minimum})
            if distance+1e-5<drill_minimum:routing_failures.append(f"{via['pcb_via_id']} drill is {distance:.4f} mm from {hole['pcb_plated_hole_id']}; needs {drill_minimum} mm")
    for pair in ['TX1','TX2','RX1','RX2','USB2']:
        for pol in 'PN':
            name=f'USB2_{pol}_TRUNK' if pair=='USB2' else f'USB4_{pair}_{pol}_PHY_A'
            if sum(c['checkedLengthMm'] for c in coupling if c['name']==name)<1:
                routing_failures.append(f'{pair}_{pol}: insufficient checked main copper')
    return {'passed':not routing_failures and bool(outer_pours) and all(s['groundViaCount'] for s in shielding)
        and all(not r['violations'] for r in results) and all(c['badLengthMm']<=.011 for c in coupling),
        'requiredGapMm':required,'usb2RequiredGapMm':.381,'results':results,'coupling':coupling,'groundShielding':shielding,
        'maximumAuthoredFenceHolePitchMm':fence_pitch,'emittedGuardStitching':guard_pitch,
        'connectorDrillClearances':drill_clearances,'routingFailures':routing_failures,
        'excludedLaunchRuns':excluded,'limitations':'Fixed BGA, via, ESD, capacitor, resistor and connector launches require final SI qualification. Fabrication clearance checks apply throughout.'}

if __name__=='__main__':
    file=Path(sys.argv[1]); raw=file.read_bytes(); report=audit(json.loads(raw))
    report.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest())
    output=ROOT/'dist/usb4-routing/asmedia-spacing.json';output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2))
    print('USB4 ASMedia coupled-route isolation:',report['passed'])
    for r in report['results']:
        if r['violations']:print(r['name'],r['layer'],json.dumps(r['violations'][:12]))
    for c in report['coupling']:
        if c['badLengthMm']>.011:print('Uncoupled trunk:',c)
    for s in report['groundShielding']:
        if not s['groundViaCount']:print('Floating shield copper:',s)
    for f in report['routingFailures']:print(f)
    if '--self-test' in sys.argv and report['passed']:
        changed=copy.deepcopy(json.loads(raw))
        if isinstance(changed,dict):changed=changed['circuitJson']
        changed.append({'type':'pcb_smtpad','pcb_smtpad_id':'intrusion-regression','shape':'circle','radius':.1,
            'x':37,'y':101.21175,'layer':'top'})
        assert not audit(changed)['passed'],'Copper intrusion was not rejected'
        changed=copy.deepcopy(json.loads(raw))
        if isinstance(changed,dict):changed=changed['circuitJson']
        changed=[e for e in changed if not(e['type']=='pcb_via' and abs(e['x']-35.9)<1e-5 and abs(e['y']-95.5)<1e-5)]
        assert any('Missing full-stack' in f for f in audit(changed)['routingFailures']),'Missing fence via was not rejected'
        print('USB isolation/fence regression checks: passed')
    sys.exit(0 if report['passed'] else 1)
