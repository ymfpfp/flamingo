"""Check native stitch proposals as full-stack vias; no routing or site search."""
import importlib.util
import json
from pathlib import Path
import sys
from shapely.geometry import Point, box
from check_layout import model, ROOT

source, baseline, candidates, output = map(Path, sys.argv[1:5])
raw = json.loads(source.read_text())
j,sc,sp,pp,st,vias,pours,cu,nets,root,vn,port = model(raw)
old = model(json.loads(baseline.read_text()))
old_names = {v:k for k,v in old[8].items()}
regions = []
for i,name in enumerate(['pcie-tx/check_asmedia_spacing.py','usb4/check_layout.py','bridge-clocks/check_layout.py']):
    spec=importlib.util.spec_from_file_location('stitch_isolation_'+str(i),ROOT/'simulations'/name)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    assert m.audit(raw,isolation_regions=regions)['passed']
by_id={e['source_net_id']:e['name'] for e in j if e['type']=='source_net'}
keepouts=[box(e['center']['x']-e['width']/2,e['center']['y']-e['height']/2,
              e['center']['x']+e['width']/2,e['center']['y']+e['height']/2)
          for e in j if e['type']=='pcb_keepout' and e.get('shape')=='rect']
sites={}
for group in json.loads(candidates.read_text())['records']:
    for v in group['pcbVias']:
        sites.setdefault((v['x'],v['y']),v)
accepted,rows=[],[]
for v in sites.values():
    rail=by_id[v['source_net_id']];n=nets[rail];p=Point(v['x'],v['y']);land=p.buffer(v['outer_diameter']/2)
    reasons=[]
    if rail=='VDD' and v['x']<26:reasons.append('Outside retained VDD intent')
    copper_gap=min(land.distance(o['shape']) for o in cu if o['net']!=n and o['label']not in pours)
    if copper_gap<.1:reasons.append('Foreign pad/trace/via clearance')
    isolation=min(land.distance(r['shape'])-r['requiredGapMm'] for r in regions)
    if isolation<.006:reasons.append('High-speed isolation reserve')
    if any(land.distance(k)<.0052 for k in keepouts):reasons.append('Native keepout')
    if any(p.distance(Point(a['x'],a['y'])) < v['hole_diameter']/2+a['drillDiameter']/2+.25
           for a in accepted):reasons.append('Previously accepted stitch drill clearance')
    # Refuse to punch a new hole through another power domain's old region.
    if any(land.intersects(o['shape']) for o in old[7] if o['label']in old[6]
           and any(l in o['layers'] for l in ['inner2','inner3'])
           and old_names.get(o['net']) not in [rail,'GND','GNDA']):reasons.append('Existing foreign power region')
    row=dict(rail=rail,x=v['x'],y=v['y'],minimumCopperGapMm=copper_gap,
             isolationMarginMm=isolation,rejectedBy=reasons)
    rows.append(row)
    if reasons:continue
    accepted.append(dict(name=f'PDN_COST_{rail}_{len(accepted)}',part='L_'+rail,port='pin2',
                         net=rail,x=v['x'],y=v['y'],copperDiameter=v['outer_diameter'],drillDiameter=v['hole_diameter'],role='stitch'))
output.write_text(json.dumps(dict(source=str(source),generator='Native ViaStitchSolver proposals; independent full-stack checks',accepted=accepted,checks=rows),indent=2)+'\n')
print(json.dumps(accepted,indent=2))
