"""Necessary local attachment/escape checks; this module performs no routing.

A closed trace-center island cannot escape on top. If all its potential
through-via centers also lie in protected bottom isolation, it is blocked
while the existing copper and literal rules remain fixed. Other outcomes
are inconclusive and must still be sent to the native router.
"""
import json
import hashlib
import sys
from pathlib import Path
from shapely.geometry import Point, box
from shapely.ops import unary_union
import shapely

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'simulations/power-distribution'))
from check_layout import model
from check_feasibility import attachment_space


def pad_attachment_diagnostics(pad, pads, width, gap):
    """Separate footprint limits from routed-copper limits; no path search.

    The maximum is an optimistic upper bound: a round trace cap can make any
    pad-edge contact, including offset contacts. It does not prove escape or
    connectivity. The caller's clearance policy is unchanged.
    """
    contact = attachment_space(pad, pads, width, gap)
    via_contact = attachment_space(pad, pads, .25, gap)
    lo, hi = 0., 1.
    for _ in range(20):
        mid = (lo+hi)/2
        if attachment_space(pad, pads, width, mid).is_empty:
            hi = mid
        else:
            lo = mid
    return {'fixedPadOnlyFullWidthAttachmentPossible':not contact.is_empty,
            'fixedPadOnlyMinimumViaContactPossible':not via_contact.is_empty,
            'optimisticMaximumPadClearanceForAttachmentMm':lo,
            'requiredClearanceMm':gap,
            'traceWidthMm':width}

def local_escape(pad, foreign, width, gap, bottom_forbidden, x=0, y=0):
    window=box(x-2,y-2,x+2,y+2)
    forbidden=unary_union([s.buffer(width/2+gap-.001,quad_segs=64) for s in foreign])
    free=window.difference(forbidden)
    regions=[p for p in getattr(free,'geoms',[free]) if not p.is_empty and p.intersects(pad.buffer(width/2+.001))]
    reachable=unary_union(regions)
    open_top=any(p.distance(window.boundary)<.001 for p in regions)
    direct_vias=pad.buffer(.125+.001).difference(unary_union([s.buffer(.125+gap-.001,quad_segs=64) for s in foreign]))
    possible_vias=reachable.union(direct_vias).difference(bottom_forbidden)
    return {'topEscapeOutOf2mmWindowPossible':open_top,
            'reachableTopTraceCenterAreaMm2':reachable.area,
            'possibleViaCenterAreaOutsideBottomIsolationMm2':possible_vias.area,
            'blockedUnderFixedCopperAndLiteralRules':not open_top and possible_vias.is_empty}

def audit(raw, jobs, constraints):
    j, sc, sp, pp, st, vias, pours, copper, nets, root, via_net, port = model(raw)
    bottom = [shapely.from_wkb(bytes.fromhex(r['shapeWkbHex'])).buffer(r['requiredGapMm']+.125-.001, quad_segs=64)
              for r in constraints['isolationRegions'] if r['layer']=='bottom']
    bottom_forbidden = unary_union(bottom)
    rows = []
    for job in jobs:
        terminals = []
        for terminal in job['terminals']:
            if not terminal['selector'].startswith('ASM2464PDX.'):
                continue
            x, y = terminal['x'], terminal['y']
            at = Point(x,y)
            net = root(terminal['sourcePortId'])
            pad = next(o['shape'] for o in copper if o['port']==terminal['pcb_port_id'])
            objects = [o for o in copper if o['net']!=net and 'top' in o['layers'] and o['shape'].distance(at)<3]
            foreign = [o['shape'] for o in objects]
            w, gap = job['rule']['widthMm'], job['rule']['clearanceMm']
            # Also include optimistic leading vias contacting the pad directly.
            # A 0.25 mm via is the smallest permitted process; larger pads only
            # reduce the available space. Ignore inner copper in this proof.
            pads = [o['shape'] for o in objects if o['port']]
            terminals.append({'selector':terminal['selector'],
                **local_escape(pad,foreign,w,gap,bottom_forbidden,x,y),
                **pad_attachment_diagnostics(pad,pads,w,gap),
                'nearestTopForeignCopper':[{'label':o['label'],'padGapMm':o['shape'].distance(pad),
                    'kind':'pad' if o['port'] else 'trace' if o['trace'] else 'via-or-pour'}
                    for o in sorted(objects,key=lambda o:o['shape'].distance(pad))[:6]]})
        rows.append({'net':job['name'],'blocked':any(t['blockedUnderFixedCopperAndLiteralRules'] for t in terminals),'terminals':terminals})
    return {'scope':'Optimistic necessary local conditions: 1 um clearance relaxation, any pad-edge attachment, any reachable top center region, minimum process via and bottom protected-trunk isolation. Inner copper, drills and ground support are omitted, so a nonblocked result does not prove routability. No geometric path search or board changes.',
            'blockedNets':[r['net'] for r in rows if r['blocked']], 'nets':rows}

if __name__=='__main__':
    source, jobs, constraints, output = map(Path,sys.argv[1:5])
    cover=json.loads(constraints.read_text())
    sha=hashlib.sha256(source.read_bytes()).hexdigest()
    if cover['sourceSha256']!=sha:raise ValueError('Stale local isolation constraints')
    report = audit(json.loads(source.read_text()),json.loads(jobs.read_text()),cover)
    report['sourceSha256']=sha
    output.write_text(json.dumps(report,indent=2)+'\n')
    print('Locally blocked under fixed copper/literal rules:', ', '.join(report['blockedNets']) or 'none established')
