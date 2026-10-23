"""Encode existing high-speed isolation as native surface-pour keepouts.

Usage: python prepare_surface_moats.py board.circuit.json output.json
       [--planned-stitches=manufacturing/power-distribution/terminals.json]

This converts constraints, not routes. Native tscircuit fills the authored power
outlines. Every emitted board must still pass the physical and isolation audits.
The power pours must retain at least 0.205 mm pad margin. A conservative 0.19 mm
part of the native foreign-via antipad completes the moat around those vias.
VCCL/VDD vias are never assumed to receive antipads from either power pour.
"""
import hashlib
import json
import sys
from pathlib import Path

from shapely import from_wkb
from shapely.geometry import Point, box, LineString
from shapely.ops import unary_union
from shapely.prepared import prep

from check_layout import ROOT, model
sys.path.insert(0, str(ROOT/'simulations/control-routing'))
from prepare_obstacles import isolation_cover, cover_polygon


def generate(j):
    isolation = isolation_cover(j)  # Refuse a baseline that fails its SI audits.
    # The long CC1 top escape also needs 15 mil spacing. The short connector
    # pad launch keeps its separately approved fixed-pad policy.
    control_raw = (ROOT/'manufacturing/control-routing/routed-surface.json').read_bytes()
    cc1 = next(n for n in json.loads(control_raw) if n['net'] == 'ASM_CC1')
    source_traces = {e['source_trace_id']: e for e in j if e['type'] == 'source_trace'}
    for section in cc1['segments']:
        if section['layer'] != 'top' or LineString(section['points']).length < .1:
            continue
        trace = next(e for e in j if e['type'] == 'pcb_trace'
                     and source_traces[e['source_trace_id']].get('name') == section['name'])
        points = [(p['x'], p['y']) for p in trace['route'] if p['route_type'] == 'wire' and p['layer'] == 'top']
        isolation['isolationRegions'].append(dict(name=section['name'], traceId=trace['pcb_trace_id'],
            layer='top', requiredGapMm=.381,
            shapeWkbHex=LineString(points).buffer(section['width']/2, quad_segs=64).wkb_hex))
    _, _, _, _, _, vias, _, _, nets, _, via_net, _ = model(j)
    keepouts, proofs = [], []
    # Union of the authored surface outlines. No new power region extends into
    # the excluded western area above y=99.5 mm.
    window = unary_union([box(.5, 78.4, 46, 99.5), box(22, 99.5, 46, 108)])
    for layer in ['top', 'bottom']:
        wanted = unary_union([
            from_wkb(bytes.fromhex(r['shapeWkbHex'])).buffer(r['requiredGapMm']+.006, quad_segs=64)
            for r in isolation['isolationRegions'] if r['layer'] == layer
        ]).intersection(window)
        antipads = unary_union([
            Point(v['x'], v['y']).buffer(v['outer_diameter']/2+.19, quad_segs=64)
            for v in vias.values() if layer in v['layers']
            and via_net(v) not in [nets['VCCL'], nets['VDD']]
        ])
        desired = wanted.difference(antipads)
        # Native placement checks include vias even with allowTraces and
        # allowPlacements. Keep a >5 um gap to every existing via land.
        guards = unary_union([
            Point(v['x'], v['y']).buffer(v['outer_diameter']/2+.0052, quad_segs=64)
            for v in vias.values() if layer in v['layers']
        ])
        allowed = prep(box(-1, -1, 54, 125).difference(guards))
        desired_prepared = prep(desired)
        pending, rectangles = cover_polygon(desired, .05), []
        while pending:
            bounds = pending.pop()
            rectangle = box(*bounds)
            if not desired_prepared.intersects(rectangle):
                continue
            # Three-nanometre overlaps prevent seams after native coordinate
            # conversion. Check the expanded rectangles, not only the tiles.
            expanded = rectangle.buffer(.000003, join_style=2)
            if allowed.covers(expanded):
                rectangles.append(expanded)
                continue
            x0, y0, x1, y1 = bounds
            if max(x1-x0, y1-y0) <= .00001:
                raise ValueError(f'{layer}: moat cannot avoid a via at {bounds}')
            if x1-x0 >= y1-y0:
                middle = (x0+x1)/2
                pending.extend([(x0, y0, middle, y1), (middle, y0, x1, y1)])
            else:
                middle = (y0+y1)/2
                pending.extend([(x0, y0, x1, middle), (x0, middle, x1, y1)])
        cover = unary_union(rectangles)
        missed = wanted.difference(cover.union(antipads).buffer(1e-9)).area
        minimum_via_gap = min(cover.distance(Point(v['x'], v['y']))-v['outer_diameter']/2
                              for v in vias.values() if layer in v['layers'])
        if missed > 1e-9 or minimum_via_gap < .0051:
            raise ValueError(f'{layer}: incomplete moat or via overlap: {missed}, {minimum_via_gap}')
        for i, rectangle in enumerate(rectangles):
            x0, y0, x1, y1 = rectangle.bounds
            keepouts.append(dict(type='pcb_keepout', pcb_keepout_id=f'pdn_si_moat_{layer}_{i}',
                shape='rect', center={'x': (x0+x1)/2, 'y': (y0+y1)/2},
                width=x1-x0, height=y1-y0, layers=[layer], allow_traces=True, allow_placements=True))
        proofs.append(dict(layer=layer, missedAreaMm2=missed, rectangles=len(rectangles),
            minimumViaGapMm=minimum_via_gap, minimumNativePadMarginMm=.205,
            conservativeForeignViaAntipadMarginMm=.19, isolationReserveMm=.006))
    routes = sorted(json.dumps(e['route'], sort_keys=True, separators=(',', ':'))
                    for e in j if e['type'] == 'pcb_trace')
    return dict(proofs=proofs, keepouts=keepouts,
        controlRoutingSha256=hashlib.sha256(control_raw).hexdigest(),
        traceGeometrySha256=hashlib.sha256('\n'.join(routes).encode()).hexdigest(),
        scope='Native surface-pour constraints only; no signal route or placement changes.')


if __name__ == '__main__':
    source, destination = map(Path, sys.argv[1:3])
    raw = source.read_bytes()
    j = json.loads(raw)
    j = j.get('circuitJson', j) if isinstance(j, dict) else j
    planned = next((a.split('=', 1)[1] for a in sys.argv[3:] if a.startswith('--planned-stitches=')), None)
    planned_records = []
    if planned:
        planned_raw = Path(planned).read_bytes()
        for terminal in json.loads(planned_raw):
            if terminal['role'] != 'stitch':
                continue
            if any(e['type'] == 'pcb_via' and abs(e['x']-terminal['x']) < 1e-7
                   and abs(e['y']-terminal['y']) < 1e-7 for e in j):
                continue
            net = next(e['source_net_id'] for e in j if e['type'] == 'source_net' and e['name'] == terminal['net'])
            j.append(dict(type='pcb_via', pcb_via_id=terminal['name'], source_net_id=net,
                x=terminal['x'], y=terminal['y'], hole_diameter=terminal['drillDiameter'],
                outer_diameter=terminal['copperDiameter'],
                layers=['top', 'inner1', 'inner2', 'inner3', 'inner4', 'bottom'],
                from_layer='top', to_layer='bottom', subcircuit_id='subcircuit_source_group_22'))
            planned_records.append(terminal)
    result = generate(j)
    result['sourceSha256'] = hashlib.sha256(raw).hexdigest()
    if planned:
        result.update(plannedStitchesFile=planned,
            plannedStitchesSha256=hashlib.sha256(planned_raw).hexdigest(),
            addedPlannedStitches=planned_records)
    destination.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result['proofs'], indent=2))
