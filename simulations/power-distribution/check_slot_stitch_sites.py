"""Independently check native slot stitch proposals as full-stack vias."""
import hashlib
import json
import sys
from pathlib import Path
from shapely import from_wkb
from shapely.geometry import Point, box
from check_layout import model

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'control-routing'))
from prepare_obstacles import isolation_cover

source, candidates, output = map(Path, sys.argv[1:4])
raw = source.read_bytes()
j = json.loads(raw)
m = model(j)
iso = [(from_wkb(bytes.fromhex(r['shapeWkbHex'])), r['requiredGapMm'])
       for r in isolation_cover(j)['isolationRegions']]
keepouts = [box(e['center']['x']-e['width']/2,e['center']['y']-e['height']/2,
                e['center']['x']+e['width']/2,e['center']['y']+e['height']/2)
            for e in j if e['type']=='pcb_keepout' and e.get('shape')=='rect']
rows = []
for v in json.loads(candidates.read_text())['pcbVias']:
    land = Point(v['x'],v['y']).buffer(v['outer_diameter']/2)
    gap = min(land.distance(o['shape']) for o in m[7]
              if o['net'] != m[8]['SLOT_3V3'] and o['label'] not in m[6])
    si = min(land.distance(shape)-required for shape,required in iso)
    moat = min(land.distance(k) for k in keepouts)
    rows.append(dict(x=v['x'],y=v['y'],landMm=v['outer_diameter'],drillMm=v['hole_diameter'],
                     gapMm=gap,siMarginMm=si,keepoutGapMm=moat,
                     accepted=gap>=.1 and si>=.006 and moat>=.0052))
result = dict(sourceSha256=hashlib.sha256(raw).hexdigest(),
              candidateSha256=hashlib.sha256(candidates.read_bytes()).hexdigest(),checks=rows,
              scope='All-layer foreign pads, traces and vias; high-speed isolation; native keepouts. Rebuilt pours and all power drops must be checked after adding a site.')
output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps([r for r in rows if r['accepted'] and 83<r['y']<99],indent=2))
