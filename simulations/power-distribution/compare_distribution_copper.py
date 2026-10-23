"""Compare emitted copper by semantic net and layer after a core-rail change.

Usage: python compare_distribution_copper.py before.json after.json output.json
Only VCCL/VDD copper and new-via antipads in the ground references may change.
This does not replace spacing, reference-plane projection, or DC checks.
"""
import hashlib
import json
import sys
from pathlib import Path

from shapely.ops import unary_union
from shapely.geometry import Point
from check_layout import model


def shapes(path):
    raw=path.read_bytes()
    _,_,_,_,_,vias,_,copper,nets,root,via_net,port=model(json.loads(raw))
    grouped={}
    for name,net in nets.items():
        for layer in ['top','inner1','inner2','inner3','inner4','bottom']:
            grouped[name,layer]=unary_union([o['shape'] for o in copper if o['net']==net and layer in o['layers']])
    return grouped,hashlib.sha256(raw).hexdigest(),vias


if __name__=='__main__':
    before,after,out=map(Path,sys.argv[1:4])
    old,old_hash,old_vias=shapes(before);new,new_hash,new_vias=shapes(after)
    key=lambda v:tuple(round(v[k],6) for k in ['x','y','outer_diameter','hole_diameter'])
    old_sites={key(v) for v in old_vias.values()}
    added=[v for v in new_vias.values() if key(v) not in old_sites]
    # Same 0.16 mm ground-pour pad margin and 6 um polygon allowance as the
    # independent check_preserved_references.py audit.
    antipads=unary_union([Point(v['x'],v['y']).buffer(v['outer_diameter']/2+.166,quad_segs=128) for v in added])
    records=[]
    for net,layer in sorted(old.keys()|new.keys()):
        a=old.get((net,layer),unary_union([]));b=new.get((net,layer),unary_union([]))
        delta=a.symmetric_difference(b).area
        if delta>1e-8:
            removed=a.difference(b);extra=b.difference(a)
            allowed=net in ['VCCL','VDD']
            if net in ['GND','GNDA'] and layer in ['inner1','inner4']:
                allowed=extra.area<1e-8 and removed.difference(antipads).area<1e-6
            records.append(dict(net=net,layer=layer,removedMm2=removed.area,
                addedMm2=extra.area,allowed=allowed))
    report=dict(passed=all(r['allowed'] for r in records),changes=records,
        baselineSha256=old_hash,sourceSha256=new_hash,
        addedViaSites=len(added),scope='Emitted copper unions by semantic net and layer. Only VCCL/VDD changes and added-via ground-reference antipads are allowed.')
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    sys.exit(0 if report['passed'] else 1)
