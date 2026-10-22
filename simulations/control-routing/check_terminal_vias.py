"""Validate proposed contacts at real SMT terminal centers; no route search."""
import copy
import hashlib
import json
import sys
from pathlib import Path
import shapely
from check_acceptance import audit

board,jobs_file,cover_file,output=map(Path,sys.argv[1:5])
raw=json.loads(board.read_text())
jobs=json.loads(jobs_file.read_text())
cover=json.loads(cover_file.read_text())
if hashlib.sha256(board.read_bytes()).hexdigest()!=cover['sourceSha256']:
    raise ValueError('Stale terminal-via constraints')
regions=[{**r,'shape':shapely.from_wkb(bytes.fromhex(r['shapeWkbHex']))} for r in cover['isolationRegions']]
records=[]
for job in jobs:
    if job['name'] in ['ASM_CC1','ASM_CC2','FLASH_WP','PCIE_PERST_N','PCIE_CLKREQ_N']:
        continue
    has_bga=any(t['selector'].startswith('ASM2464PDX.') for t in job['terminals'])
    diameter,hole=(.25,.15) if has_bga else (.3,.2)
    for p in job['terminals']:
        if 'bottom' in p['layers']:
            continue
        contact={**job,'terminals':[p]}
        result={'net':job['name'],'solved':True,'traces':[{'route':[
            {'route_type':'wire','x':p['x'],'y':p['y'],'layer':'top','width':job['rule']['widthMm']},
            {'route_type':'via','x':p['x'],'y':p['y'],'from_layer':'top','to_layer':'bottom','via_diameter':diameter,'via_hole_diameter':hole},
            {'route_type':'wire','x':p['x'],'y':p['y'],'layer':'bottom','width':job['rule']['widthMm']}]}]}
        report=audit(raw,[contact],[result],regions)['nets'][0]
        records.append({'net':job['name'],'selector':p['selector'],'diameterMm':diameter,'holeMm':hole,**report})
output.write_text(json.dumps({'sourceSha256':cover['sourceSha256'],'contacts':records,
    'scope':'Single proposed via-in-pad contacts only. Complete signal routes, other proposed contacts, native refill and plane continuity still need joint verification.'},indent=2)+'\n')
for job in jobs:
    good=[r['selector'] for r in records if r['net']==job['name'] and r['passed']]
    if good:print(job['name']+': '+', '.join(good))
