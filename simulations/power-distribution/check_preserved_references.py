"""Check that this power-copper pass only adds via antipads to L2/L5 GND."""
import hashlib,json,sys
from pathlib import Path
from shapely.geometry import Point
from shapely.ops import unary_union
from check_layout import model

before_file,after_file,output=map(Path,sys.argv[1:4])
def geometry(file):
    raw=file.read_bytes();data=model(json.loads(raw))
    _,_,_,_,_,vias,pours,copper,nets,_,_,_=data
    planes={layer:unary_union([o['shape'] for o in copper if o['label']in pours
        and o['net']==nets['GND'] and layer in o['layers']])for layer in ['inner1','inner4']}
    return vias,planes,hashlib.sha256(raw).hexdigest()
before,old,old_hash=geometry(before_file);after,new,new_hash=geometry(after_file)
def key(v):return tuple(round(v[k],6)for k in ['x','y','outer_diameter','hole_diameter'])
old_sites={key(v)for v in before.values()};added=[v for v in after.values()if key(v)not in old_sites]
# Existing GND pad margin is 0.16 mm. Six micrometres cover the native
# polygon/circle approximation; projected signal support is checked separately.
expected=unary_union([Point(v['x'],v['y']).buffer(v['outer_diameter']/2+.166,quad_segs=128)for v in added])
records=[]
for layer in ['inner1','inner4']:
    removed=old[layer].difference(new[layer]);extra=new[layer].difference(old[layer])
    unexpected=removed.difference(expected).area
    records.append(dict(layer=layer,removedGroundAreaMm2=removed.area,
        addedGroundAreaMm2=extra.area,removedOutsideNewAntipadsMm2=unexpected,
        passed=unexpected<1e-6 and extra.area<1e-6))
report=dict(passed=all(r['passed']for r in records),layers=records,addedViaSites=len(added),
    baselineSha256=old_hash,sourceSha256=new_hash,
    scope='Geometric ground-plane preservation. Only new power-via antipads may remove L2/L5 ground. Signal projection and channel SI remain separate checks.')
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2));sys.exit(0 if report['passed']else 1)
