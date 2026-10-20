"""Extract PCB-only SI review data from rendered tscircuit copper, without routing."""
from pathlib import Path
import json, math, hashlib
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

CONTACTS=[('R20','R21','B14','B15'),('U20','U21','B19','B20'),('Y17','AA17','B23','B24'),('Y15','AA15','B27','B28')]

def load_geometry(path):
    raw=Path(path).read_bytes(); j=json.loads(raw)
    if isinstance(j,dict):j=j['circuitJson']
    comp={e['name']:e['source_component_id'] for e in j if e['type']=='source_component'}
    sp=[e for e in j if e['type']=='source_port'];pp=[e for e in j if e['type']=='pcb_port']
    traces=[e for e in j if e['type']=='pcb_trace']; vias=[e for e in j if e['type']=='pcb_via']
    gnd=next(e['source_net_id'] for e in j if e['type']=='source_net' and e['name']=='GND')
    returns=[v for v in vias if v.get('source_net_id')==gnd and 'inner1' in v['layers'] and 'inner4' in v['layers']]
    planes={e['layer']:Polygon([(p['x'],p['y']) for p in e['brep_shape']['outer_ring']['vertices']],
        [[(p['x'],p['y']) for p in r['vertices']] for r in e['brep_shape'].get('inner_rings',[])]) for e in j if e['type']=='pcb_copper_pour'}
    def pos(name,pin):
        p=next(p for p in sp if p['source_component_id']==comp[name] and pin in p.get('port_hints',[]))
        return next(q for q in pp if q['source_port_id']==p['source_port_id'])
    def route(a,b):
        def match(t,p):return any(math.hypot(q.get('x',1e9)-p['x'],q.get('y',1e9)-p['y'])<1e-4 for q in [t['route'][0],t['route'][-1]])
        found=[t for t in traces if match(t,a) and match(t,b)]
        if len(found)!=1:raise ValueError(f'Expected one physical route; found {len(found)}')
        return found[0]
    def segments(t):
        r=t['route'];out=[]
        for a,b in zip(r,r[1:]):
            if a['route_type']==b['route_type']=='wire' and a['layer']==b['layer']:
                length=math.hypot(b['x']-a['x'],b['y']-a['y'])
                if length>1e-8:out.append({'a':a,'b':b,'length':length,'layer':a['layer'],'width':a['width'],
                    'line':LineString([(a['x'],a['y']),(b['x'],b['y'])])})
        return out
    all_routes={}
    for lane,balls in enumerate(CONTACTS):
        for i,pol in enumerate('PN'):
            a=pos('ASM2464PDX',balls[i]);ci=pos(f'C_TX{lane}_{pol}','pin1');co=pos(f'C_TX{lane}_{pol}','pin2');end=pos('PCIe',balls[i+2])
            all_routes[f'TX{lane}_{pol}']={'bridge':route(a,ci),'connector':route(co,end)}
    result={'input':str(path),'sha256':hashlib.sha256(raw).hexdigest(),'sampling_pitch_mm':.01,'nominal_gap_mm':.1001,
            'gap_tolerance_mm':.005,'conductors':[],'vias':[],'pads':[]}
    for name,parts in all_routes.items():
        mate=all_routes[name[:-1]+('N' if name[-1]=='P' else 'P')]
        for stage,t in parts.items():
            segs=segments(t);mates=segments(mate[stage]);samples=[];runs=[];run=None
            copper_length=sum(s['length'] for s in segs);uncoupled=0.;max_gap=0.
            bottom_length=sum(s['length'] for s in segs if s['layer']=='bottom');bottom_distance=0.
            for s in segs:
                n=math.ceil(s['length']/.01);ds=s['length']/n
                axis=np.array([s['b']['x']-s['a']['x'],s['b']['y']-s['a']['y']])/s['length']
                other=[m for m in mates if m['layer']==s['layer']]
                for k in range(n):
                    f=(k+.5)/n;x=s['a']['x']+f*(s['b']['x']-s['a']['x']);y=s['a']['y']+f*(s['b']['y']-s['a']['y']);p=Point(x,y)
                    closest=min(other,key=lambda m:m['line'].distance(p)) if other else None
                    distance=closest['line'].distance(p) if closest else float('inf')
                    gap=max(0.,distance-s['width'])
                    tangent=np.array([closest['b']['x']-closest['a']['x'],closest['b']['y']-closest['a']['y']])/closest['length'] if closest else np.array([0,0])
                    coupled=bool(abs(gap-.1001)<=.005 and abs(axis@tangent)>math.cos(math.radians(2)))
                    if not coupled:uncoupled+=ds
                    max_gap=max(max_gap,gap)
                    if run is None or coupled!=run['coupled'] or s['layer']!=run['layer']:
                        run={'coupled':coupled,'layer':s['layer'],'length_mm':0.,'start':[x,y],'end':[x,y]};runs.append(run)
                    run['length_mm']+=ds;run['end']=[x,y]
                    at=bottom_distance+f*s['length']
                    trunk=bool(s['layer']=='bottom' and 3<=at<=bottom_length-.4)
                    corner_limit=(.1234+.1001)/math.cos(math.pi/8)-.1234
                    samples.append({'x':x,'y':y,'layer':s['layer'],'coupled':coupled,'mate_gap_mm':gap,
                        'in_coupled_trunk':trunk,'corner_envelope_valid':bool(.1001-.0002<=gap<=corner_limit+.0002)})
                if s['layer']=='bottom':bottom_distance+=s['length']
            voids=[]
            own_vias=[Point(p['x'],p['y']) for p in t['route'] if p['route_type']=='via']
            for s in segs:
                plane=planes['inner1' if s['layer']=='top' else 'inner4']
                unsupported=s['line'].difference(plane)
                own_openings=unary_union([Polygon(r) for r in plane.interiors
                    if any(Polygon(r).covers(p) for p in own_vias)])
                if unsupported.length>.001:voids.append({'layer':s['layer'],'length_mm':unsupported.length,
                    'outside_own_via_openings_mm':unsupported.difference(own_openings).length,
                    'points':list(unsupported.coords) if unsupported.geom_type=='LineString' else [list(g.coords) for g in unsupported.geoms]})
            record={'name':name,'stage':stage,'length_mm':copper_length,'nominally_coupled_length_mm':copper_length-uncoupled,
                'away_from_nominal_gap_mm':uncoupled,'max_nearest_mate_gap_mm':max_gap,
                'longest_away_from_nominal_run_mm':max([r['length_mm'] for r in runs if not r['coupled']]+[0]),
                'centerline_over_plane_void_mm':sum(v['length_mm'] for v in voids),
                'centerline_over_void_outside_own_via_openings_mm':sum(v['outside_own_via_openings_mm'] for v in voids),
                'plane_void_segments':voids,'runs':runs,'samples':samples}
            result['conductors'].append(record)
            for p in t['route']:
                if p['route_type']!='via':continue
                v=min(vias,key=lambda v:math.hypot(v['x']-p['x'],v['y']-p['y']))
                nearest=min(returns,key=lambda r:math.hypot(r['x']-v['x'],r['y']-v['y']))
                holes={}
                for layer,plane in planes.items():
                    # Actual native copper opening, including merged clearances.
                    rings=[Polygon(r) for r in plane.interiors if Polygon(r).covers(Point(v['x'],v['y']))]
                    holes[layer]=[{'bounds':r.bounds,'area_mm2':r.area} for r in rings]
                result['vias'].append({'name':name,'stage':stage,'x':v['x'],'y':v['y'],
                    'outer_diameter_mm':v['outer_diameter'],'hole_diameter_mm':v['hole_diameter'],
                    'layers':v['layers'],'nearest_ground_via_mm':math.hypot(nearest['x']-v['x'],nearest['y']-v['y']),
                    'plane_openings':holes})
    for lane,balls in enumerate(CONTACTS):
        for i,pol in enumerate('PN'):
            for compname,pin,label in [('ASM2464PDX',balls[i],'bridge'),(f'C_TX{lane}_{pol}','pin1','capacitor input'),(f'C_TX{lane}_{pol}','pin2','capacitor output'),('PCIe',balls[i+2],'slot')]:
                p=pos(compname,pin)
                pad=next(e for e in j if e['type']=='pcb_smtpad' and e.get('pcb_port_id')==p['pcb_port_id'])
                result['pads'].append({'name':f'TX{lane}_{pol}','location':label,'pad':{k:pad[k] for k in ['x','y','shape','width','height','radius','ccw_rotation'] if k in pad}})
    return result,all_routes

if __name__=='__main__':
    import sys
    result,_=load_geometry(sys.argv[1] if len(sys.argv)>1 else 'dist/pcie-si/input.circuit.json')
    Path('dist/pcie-si/geometry.json').write_text(json.dumps(result,indent=2))
    for r in result['conductors']:
        if r['stage']=='bridge':print(r['name'],'length',round(r['length_mm'],3),'away from nominal',round(r['away_from_nominal_gap_mm'],3),'longest run',round(r['longest_away_from_nominal_run_mm'],3),'max gap',round(r['max_nearest_mate_gap_mm'],3),'plane void',round(r['centerline_over_plane_void_mm'],3))
    print('Return-via max distance',max(v['nearest_ground_via_mm'] for v in result['vias']))
