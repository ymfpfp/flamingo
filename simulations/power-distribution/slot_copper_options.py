"""Conductivity sensitivity and local loss analysis. No board geometry changes."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from shapely import contains_xy
from shapely.geometry import Point
from shapely.ops import unary_union

from check_layout import ROOT, model
from check_slot_dc import CASES, solve
from check_dc import RHO80, PLATING, z

OUT = ROOT / 'dist/slot-power-copper-options'
SOURCE = ROOT / 'dist/board.circuit.json'
PREVIOUS = ROOT / 'dist/slot-power-copper-review/after-dc.json'
MAPS = ROOT / 'dist/slot-power-copper-review/after-map'
LAYERS = {'top': .035, 'inner2': .0152, 'inner3': .0152, 'bottom': .035}


def loss_distribution(raw, rail):
    """Sum resistor dissipation from saved fine-grid voltages and exact mesh edges."""
    j, sc, sp, pp, st, vias, pours, copper, nets, root, via_net, port = model(raw)
    n = nets[rail]
    holes = unary_union([Point(e['x'], e['y']).buffer(e['hole_diameter']/2, quad_segs=24)
        for e in j if e['type'] in ['pcb_via', 'pcb_plated_hole'] and 'hole_diameter' in e])
    maps = {}
    contributions = []
    for layer, t in LAYERS.items():
        d = np.load(MAPS / f'{rail}-{layer}-0.12.npz')
        xs, ys, voltage = d['x'], d['y'], -d['drop_mv']/1000
        shape = unary_union([o['shape'] for o in copper if o['net']==n and layer in o['layers']]).difference(holes)
        xx, yy = np.meshgrid(xs, ys)
        maps[layer] = (xs, ys, voltage)
        bins = np.zeros(23)
        total = 0.
        for dx, dy, factor in [(1,0,2/3),(0,1,2/3),(1,1,1/6),(-1,1,1/6)]:
            sa = (slice(max(0,dy),len(ys)+min(0,dy)),slice(max(0,dx),len(xs)+min(0,dx)))
            sb = (slice(max(0,-dy),len(ys)+min(0,-dy)),slice(max(0,-dx),len(xs)+min(0,-dx)))
            midx, midy = (xx[sa]+xx[sb])/2, (yy[sa]+yy[sb])/2
            valid = np.isfinite(voltage[sa]) & np.isfinite(voltage[sb])
            valid &= contains_xy(shape.buffer(1e-8), midx, midy)
            power = t/RHO80*factor*(voltage[sa][valid]-voltage[sb][valid])**2
            total += float(power.sum())
            bins += np.histogram(midy[valid], bins=np.arange(10,126,5), weights=power)[0]
        contributions.append(dict(layer=layer, powerMW=total*1000, equivalentDropMV=total/5.5*1000,
            bands=[dict(yLowMm=10+5*i,yHighMm=15+5*i,powerMW=float(v)*1000) for i,v in enumerate(bins)]))

    def voltage_at(layer,x,y):
        xs, ys, voltage = maps[layer]
        pitch = float(xs[1]-xs[0]); ix=round((x-xs[0])/pitch); iy=round((y-ys[0])/pitch)
        candidates=[]
        for ry in range(max(0,iy-2),min(len(ys),iy+3)):
            for rx in range(max(0,ix-2),min(len(xs),ix+3)):
                if np.isfinite(voltage[ry,rx]):candidates.append((float(np.hypot(xs[rx]-x,ys[ry]-y)),float(voltage[ry,rx])))
        if not candidates or min(candidates)[0]>pitch*1.6:return None
        return min(candidates)[1]
    via_power=0.
    for v in vias.values():
        if via_net(v)!=n:continue
        radius=(v['hole_diameter']+v['outer_diameter'])/4
        for dx,dy in [(radius,0),(-radius,0),(0,radius),(0,-radius)]:
            touching=[(l,voltage_at(l,v['x']+dx,v['y']+dy)) for l in maps if l in v['layers']]
            touching=[(l,value) for l,value in touching if value is not None]
            for (first,a),(last,b) in zip(touching,touching[1:]):
                g=np.pi*(v['hole_diameter']+PLATING)*PLATING/(RHO80*(z[last]-z[first]))/4
                via_power+=g*(a-b)**2
    return dict(rail=rail,layers=contributions,viaPowerMW=via_power*1000,viaEquivalentDropMV=via_power/5.5*1000,
        totalEquivalentDropMV=sum(r['equivalentDropMV']for r in contributions)+via_power/5.5*1000,
        interpretation='Equivalent drops allocate power divided by 5.5 A. They sum to current-weighted mean terminal drop, not the maximum terminal drop.')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--study',choices=['loss','thickness'],required=True);args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    raw=SOURCE.read_bytes();sha=hashlib.sha256(raw).hexdigest();j=json.loads(raw)
    previous=json.loads(PREVIOUS.read_text());assert sha==previous['sourceSha256']
    if args.study=='loss':
        records=[]
        for rail in ['V12V','SLOT_12V']:
            r=loss_distribution(j,rail); records.append(r)
            maxdrop=next(x for x in previous['results']if x['rail']==rail)['fine']['dropMV']
            assert 0<=maxdrop-r['totalEquivalentDropMV']<1.5,(rail,maxdrop,r['totalEquivalentDropMV'])
            print(json.dumps(r),flush=True)
        report=dict(sourceSha256=sha,method='Energy allocation of the unchanged fine-grid resistive network.',records=records)
        (OUT/'loss-distribution.json').write_text(json.dumps(report,indent=2)+'\n')
        return
    scenarios=[
        ('baseline',{},1.),
        ('inner_35um',{'inner2':.035,'inner3':.035},1.),
        ('outer_70um',{'top':.070,'bottom':.070},1.),
        ('outer_70um_inner_35um',{'top':.070,'bottom':.070,'inner2':.035,'inner3':.035},1.),
        ('via_resistance_divided_by_100',{},100.),
    ]
    records=[]
    for name,thickness,via_scale in scenarios:
        rails=[]
        for case in CASES[:2]:
            r=solve(j,case,.2,layer_thickness_mm=thickness,via_conductance_scale=via_scale)
            if name=='baseline':
                old=next(x for x in previous['results']if x['rail']==case[0])['coarse']['dropMV']
                assert abs(old-r['dropMV'])<1e-7,(case[0],old,r['dropMV'])
            rails.append(r)
            print(name,case[0],round(r['dropMV'],3),'mV',flush=True)
        copper=sum(r['dropMV']for r in rails)
        # All scenarios retain the same single-mesh allowance for comparison.
        # It does not replace a mesh-convergence check of a new fabrication stackup.
        records.append(dict(name=name,layerThicknessMm={**LAYERS,**thickness},viaConductanceScale=via_scale,
            rails=rails,coarseCopperMV=copper,coarseTimes125CopperMV=1.25*copper,
            totalWithHotAons21303cMV=1.25*copper+19.8))
        (OUT/'thickness-sensitivity.json').write_text(json.dumps(dict(sourceSha256=sha,records=records,
            method='Same geometry and 0.2 mm mesh. Only sheet conductance or via conductance changes. Copper at 80 C. Via geometry and layer z positions stay fixed.',
            limitations='Conductivity sensitivity only. A 25% allowance is applied uniformly to this single mesh. No manufactured-stackup, fine-mesh, clearance, impedance, ground-return, contact, transient or thermal qualification.'),indent=2)+'\n')
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==sha


if __name__=='__main__':main()
