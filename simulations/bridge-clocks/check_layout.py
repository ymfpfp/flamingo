"""Measure emitted clock copper. This validator does not route or solve fields.

The short crystal has separate BGA, capacitor and opposite-corner crystal-pad
launches. Check the coupled sections between those launches explicitly, and
report the remaining length rather than treating the launches as uniform lines.
"""
import copy, hashlib, json, math, sys
from pathlib import Path
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'simulations/pcie-tx'))
from copper_geometry import copper_objects

def audit(j):
    if isinstance(j,dict):j=j['circuitJson']
    sources={e['source_trace_id']:e for e in j if e['type']=='source_trace'}
    traces={sources.get(t.get('source_trace_id'),{}).get('name'):t for t in j if t['type']=='pcb_trace'}
    stack=json.loads((ROOT/'manufacturing/stackup/JLC06161H-3313.json').read_text())
    width=.1234; gap=.1001; pitch=width+gap; required=8*stack['dielectrics'][0]['thicknessMm']
    planes={e['layer']:Polygon([(v['x'],v['y']) for v in e['brep_shape']['outer_ring']['vertices']],
        [[(v['x'],v['y']) for v in r['vertices']] for r in e['brep_shape'].get('inner_rings',[])])
        for e in j if e['type']=='pcb_copper_pour' and e['layer'] in ['inner1','inner4']}
    copper=copper_objects(j);results=[];references=[];failures=[]
    def segments(t):
        return [(a,LineString([(a['x'],a['y']),(b['x'],b['y'])])) for a,b in zip(t['route'],t['route'][1:])
            if a['route_type']==b['route_type']=='wire' and a['layer']==b['layer'] and math.hypot(a['x']-b['x'],a['y']-b['y'])>1e-8]
    groups=[('crystal bridge',['CLOCK_XI_BRIDGE','CLOCK_XO_BRIDGE'],{'top':box(32.8,103.7,33.2,104.6)},.8),
        ('crystal capacitor to package',['CLOCK_XI_XTAL','CLOCK_XO_XTAL'],{'top':box(32.45,106.4,33.6,107.1)},.4),
        ('REFCLK bridge',['CLOCK_REFCLK_P_PHY','CLOCK_REFCLK_N_PHY'],{'bottom':box(16.95,103.85,29.2,105.4)},10),
        ('REFCLK connector',['CLOCK_REFCLK_P_CON','CLOCK_REFCLK_N_CON'],{'top':box(15.75,99.15,16.9,99.96)},.1)]
    for label,names,windows,minimum in groups:
        if any(n not in traces for n in names):failures.append(f'{label}: missing route');continue
        group=[traces[n] for n in names];ids={t['pcb_trace_id'] for t in group}
        if label.startswith('crystal'):
            # C1 splits the same XI/XO electrical pair into two named stages.
            ids.update(t['pcb_trace_id'] for n,t in traces.items() if n and n.startswith(('CLOCK_XI_','CLOCK_XO_')))
        ports={p for t in group for p in t.get('connected_pcb_port_ids',[])}
        # Pad IDs are not always supplied on pcb_trace. Endpoint coordinates are
        # sufficient here because only the pair's own pads are removed.
        ends=[Point(p['x'],p['y']) for t in group for p in [t['route'][0],t['route'][-1]]]
        obstacles=[o for o in copper if o['trace'] not in ids and not(o['port'] in ports or
            o['port'] and any(o['shape'].covers(p) for p in ends))]
        for i,t in enumerate(group):
            mate=segments(group[1-i]);checked=bad=0;mingap=float('inf');maxgap=0;isolation=float('inf');closest=None
            total=sum(line.length for _,line in segments(t))
            for a,line in segments(t):
                layer=a['layer']
                if layer not in windows:continue
                section=line.intersection(windows[layer])
                if section.is_empty or section.length<1e-8:continue
                nearby=[s for b,s in mate if b['layer']==layer]
                mate_line=unary_union(nearby)
                count=math.ceil(line.length/.005)
                for n in range(count):
                    p=line.interpolate((n+.5)/count,normalized=True)
                    if not windows[layer].covers(p):continue
                    d=p.distance(mate_line)-width;ds=line.length/count
                    checked+=ds;mingap=min(mingap,d);maxgap=max(maxgap,d)
                    if d<gap-.0002 or d>pitch/math.cos(math.pi/8)-width+.0002:bad+=ds
                shape=section.buffer(width/2,quad_segs=16)
                for o in obstacles:
                    if layer not in o['layers']:continue
                    distance=shape.distance(o['shape'])
                    if distance<isolation:isolation=distance;closest=o['label']
            result={'name':names[i],'checkedCoupledLengthMm':checked,'launchLengthOutsideWindowMm':total-checked,
                'minimumPairGapMm':mingap,'maximumPairGapMm':maxgap,'badGeometryLengthMm':bad,
                'minimumForeignCopperGapMm':isolation,'closestForeignCopper':closest,'requiredForeignGapMm':required}
            results.append(result)
            if checked<minimum or bad>.011:failures.append(f'{names[i]}: coupled geometry outside target: {result}')
            if isolation<=required+.0001:failures.append(f'{names[i]}: foreign copper inside 8h: {result}')
    for name,t in traces.items():
        if not name or not name.startswith('CLOCK_') or 'CASE' in name:continue
        net=sources[t['source_trace_id']].get('subcircuit_connectivity_map_key')
        own=[Point(p['x'],p['y']) for q in traces.values() if net and sources.get(q.get('source_trace_id'),{}).get('subcircuit_connectivity_map_key')==net
            for p in q['route'] if p['route_type']=='via']
        openings={l:unary_union([Polygon(r) for r in plane.interiors if any(Polygon(r).covers(p) for p in own)]) for l,plane in planes.items()}
        area=0
        for a,line in segments(t):
            l='inner1' if a['layer']=='top' else 'inner4'
            area+=line.buffer(a['width']/2,cap_style=2).difference(planes[l]).difference(openings[l]).area
        references.append({'name':name,'copperAreaOverUnrelatedVoidMm2':area})
        if area>=1e-7:failures.append(f'{name}: reference-plane void ({area} mm2)')
    return {'passed':not failures,'failures':failures,'couplingAndIsolation':results,'referencePlanes':references,
        'scope':'Emitted copper in documented coupled sections; 8h = 0.7952 mm also exceeds crystal 30 mil = 0.762 mm. All copper retains fabrication DRC, including launches.',
        'launchWindows':{label:{l:list(w.bounds) for l,w in windows.items()} for label,_,windows,_ in groups},
        'limitations':'BGA necks, via/component flares and opposite-corner crystal lands are explicit launch regions, not uniform 85 ohm lines. Planar reference support excludes own electrical-net via apertures. Final SI and crystal startup checks remain pending.'}

if __name__=='__main__':
    file=Path(sys.argv[1]);raw=file.read_bytes();report=audit(json.loads(raw))
    report.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest())
    out=ROOT/'dist/bridge-clocks/layout-audit.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2))
    print('Bridge clock coupled geometry, isolation and reference support:',report['passed'])
    for failure in report['failures']:print(failure)
    if '--self-test' in sys.argv and report['passed']:
        changed=json.loads(raw)
        if isinstance(changed,dict):changed=changed['circuitJson']
        changed.append({'type':'pcb_smtpad','pcb_smtpad_id':'clock-intrusion','shape':'circle','radius':.1,
            'x':24,'y':104.8,'layer':'bottom'})
        assert any('foreign copper inside 8h' in f for f in audit(changed)['failures'])
        changed=copy.deepcopy(json.loads(raw))
        if isinstance(changed,dict):changed=changed['circuitJson']
        s=next(e for e in changed if e['type']=='source_trace' and e.get('name')=='CLOCK_REFCLK_P_PHY')
        t=next(e for e in changed if e['type']=='pcb_trace' and e.get('source_trace_id')==s['source_trace_id'])
        for i,(a,b) in enumerate(zip(t['route'],t['route'][1:])):
            if a['route_type']==b['route_type']=='wire' and a['layer']==b['layer']=='bottom' and abs(a['x']-b['x'])>5:
                t['route'].insert(i+1,{**a,'x':(a['x']+b['x'])/2,'y':a['y']+.5});break
        assert any('coupled geometry outside target' in f for f in audit(changed)['failures'])
        print('Clock regression checks: copper intrusion and separated pair rejected')
    sys.exit(0 if report['passed'] else 1)
