"""Independent physical checks of native candidates; never applies PCB changes.

Full-stack via checks use the emitted six-layer board. Reference and pour
continuity here use the existing pours; a fresh native pour refill and all
existing routing audits are still required before integration.
"""
import hashlib
import json
import math
import sys
import shapely
from pathlib import Path
from shapely.geometry import Point, LineString, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/power-distribution'))
from check_layout import model

LAYERS = ['top', 'inner1', 'inner2', 'inner3', 'inner4', 'bottom']


def copper_boundary(raw):
    board = next(e for e in raw if e['type'] == 'pcb_board')
    boundary = Polygon([(p['x'], p['y']) for p in board['outline']]) if board.get('outline') else box(
        board['center']['x']-board['width']/2, board['center']['y']-board['height']/2,
        board['center']['x']+board['width']/2, board['center']['y']+board['height']/2)
    for cutout in (e for e in raw if e['type'] == 'pcb_cutout'):
        if cutout['shape'] != 'polygon':
            raise ValueError('Unsupported board cutout shape')
        boundary = boundary.difference(Polygon([(p['x'], p['y']) for p in cutout['points']]))
    return boundary


def pth_launch(h, copper):
    """Bound the existing own-PTH reference opening by its actual pad shape."""
    pid = h.get('pcb_port_id')
    pads = [o['shape'] for o in copper if pid and o.get('port') == pid]
    if not pads:
        raise ValueError(f"Missing PTH pad copper: {h.get('pcb_plated_hole_id')}")
    return unary_union(pads).buffer(.215, quad_segs=64)


def audit(raw, jobs, results, isolation_regions=()):
    j, sc, sp, pp, st, vias, pours, copper, nets, root, via_net, port = model(raw)
    by_name = {job['name']: job for job in jobs}
    rules = json.loads((ROOT / 'jlcpcb-clearance-rules.json').read_text())['minimumMm']
    launch_policy = json.loads((ROOT / 'manufacturing/control-routing/cc-launch-policy.json').read_text())
    pad_owners = {p['pcb_port_id']: sp.get(p.get('source_port_id'), {}).get('source_component_id') for p in pp.values()}
    launch_masks = {}
    for job in jobs:
        policy = job.get('fixedPadLaunchPolicy')
        if not policy:
            continue
        if not launch_policy['authorized'] or job['name'] not in launch_policy['nets'] or policy.get('policy') != 'cc-launch-policy':
            raise ValueError('Unapproved fixed-pad launch policy')
        radius = policy['maximumDistanceFromTerminalMm']
        if radius <= 0 or radius > launch_policy['maximumDistanceFromTerminalMm']:
            raise ValueError('Fixed-pad launch region exceeds its approval')
        masks = {}
        for terminal in job['terminals']:
            owner = sp[terminal['sourcePortId']]['source_component_id']
            shape = Point(terminal['x'], terminal['y']).buffer(radius, quad_segs=64)
            masks[owner] = unary_union([masks.get(owner, Polygon()), shape])
        launch_masks[job['name']] = masks
    candidate, barrels = [], []
    rows = []
    for result in results:
        if not result.get('solved') or result.get('acceptedForStaging') is False:
            continue
        job = by_name[result['net']]
        net = root(job['terminals'][0]['sourcePortId'])
        for ti, trace in enumerate(result['traces']):
            for i, p in enumerate(trace['route']):
                if p['route_type'] != 'via':
                    continue
                pad, hole = p.get('via_diameter', .3), p.get('via_hole_diameter', .2)
                key = (job['name'], round(p['x'], 7), round(p['y'], 7))
                if any(b['key'] == key for b in barrels):
                    continue
                center = Point(p['x'], p['y'])
                barrel = {'key': key, 'net': net, 'name': job['name'], 'layers': LAYERS,
                          'label': f"{job['name']} via {len(barrels)}", 'pad': pad, 'hole': hole,
                          'center': center, 'shape': center.buffer(pad / 2, quad_segs=32),
                          'drill': center.buffer(hole / 2, quad_segs=32)}
                barrels.append(barrel)
            for a, b in zip(trace['route'], trace['route'][1:]):
                if a['route_type'] != 'wire' or b['route_type'] != 'wire' or a['layer'] != b['layer']:
                    continue
                line = LineString([(a['x'], a['y']), (b['x'], b['y'])])
                if line.length < 1e-8:
                    continue
                candidate.append({'net': net, 'name': job['name'], 'layers': [a['layer']],
                                  'label': f"{job['name']} trace {ti}", 'line': line,
                                  'shape': line.buffer(max(a['width'], b['width']) / 2, quad_segs=32),
                                  'width': min(a['width'], b['width']), 'length': line.length})
    existing_barrels = [{'center': Point(v['x'], v['y']), 'hole': v['hole_diameter'],
                         'label': v['pcb_via_id'], 'net': via_net(v)} for v in vias.values()]
    plated = []
    for h in j:
        if h['type'] == 'pcb_plated_hole':
            if h['shape'] in ['circle', 'circular_hole_with_rect_pad']:
                drill = Point(h['x'], h['y']).buffer(h['hole_diameter'] / 2, quad_segs=32)
            elif h['shape'] == 'pill':
                from shapely.affinity import rotate
                x, y, w, ht = h['x'], h['y'], h['hole_width'], h['hole_height']
                r = min(w, ht) / 2
                drill = LineString([(x-w/2+r, y-ht/2+r), (x+w/2-r, y+ht/2-r)]).buffer(r, quad_segs=32)
                drill = rotate(drill, h.get('ccw_rotation', 0), origin=(x, y))
            else:
                raise ValueError(f"Unsupported PTH drill: {h['shape']}")
            plated.append({'shape': drill, 'label': h['pcb_plated_hole_id'],
                           'launch': pth_launch(h, copper),
                           'net': root(pp.get(h.get('pcb_port_id'), {}).get('source_port_id', h['pcb_plated_hole_id']))})
    mechanical = [Point(h['x'], h['y']).buffer(h.get('hole_diameter', h.get('diameter', 0))/2, quad_segs=32)
                  for h in j if h['type'] == 'pcb_hole' and h.get('hole_shape', 'circle') == 'circle']
    boundary = copper_boundary(j)

    # Planned antipads can only remove copper. This is a connectivity screen,
    # not a substitute for the native refilled polygons in the final build.
    planned = {}
    for p in pours.values():
        b = p['brep_shape']
        shape = Polygon([(v['x'], v['y']) for v in b['outer_ring']['vertices']],
                        [[(v['x'], v['y']) for v in r['vertices']] for r in b.get('inner_rings', [])])
        net = root(p['source_net_id'])
        cuts = unary_union([v['center'].buffer(max(v['hole']/2 + .215, v['pad']/2 + .1), quad_segs=32)
                            for v in barrels if v['net'] != net])
        planned[p['pcb_copper_pour_id']] = shape.difference(cuts)

    for job in jobs:
        result = next((r for r in results if r['net'] == job['name']), None)
        if not result or not result.get('solved'):
            rows.append({'net': job['name'], 'passed': False, 'nativeSolved': False,
                         'failures': [{'rule': 'routing', 'detail': result.get('reason', 'Not attempted') if result else 'Not attempted'}]})
            continue
        if result.get('acceptedForStaging') is False:
            row = dict(result.get('physicalCheck', {}))
            row.update(net=job['name'], passed=False, nativeSolved=True)
            row.setdefault('failures', [{'rule': 'staging-rejected', 'detail': 'Candidate rejected before integration'}])
            rows.append(row)
            continue
        net = root(job['terminals'][0]['sourcePortId'])
        wires = [o for o in candidate if o['name'] == job['name']]
        own_barrels = [v for v in barrels if v['name'] == job['name']]
        failures, min_gap, nearest, min_drill = [], math.inf, None, math.inf
        min_strict_gap, min_launch_pad_gap = math.inf, math.inf
        masks = launch_masks.get(job['name'], {})
        context = {}
        def fail(rule, detail, **values):
            failures.append({'rule': rule, 'detail': detail, **context, **values})
        for wire in wires:
            context = {'segment': list(map(list, wire['line'].coords)), 'layer': wire['layers'][0]}
            permitted = job.get('allowedSignalLayers', ['top', 'bottom'])
            if wire['layers'][0] not in permitted or wire['layers'][0] in ['inner1', 'inner4']:
                fail('layer', 'Control signal uses a layer outside its configured signal layers')
            if wire['width'] < job['rule']['widthMm'] - 1e-7:
                fail('width', 'Wire narrower than configured ASMedia/project target')
            foreign = [o for o in copper + candidate + barrels if o['net'] != net and set(o['layers']) & set(wire['layers'])]
            groups = {}
            for other in foreign:
                owner = pad_owners.get(other.get('port')) if wire['layers'][0] == 'top' else None
                groups.setdefault(owner if owner in masks else None, []).append(other)
            for owner, objects in groups.items():
                other = min(objects, key=lambda o: wire['shape'].distance(o['shape']))
                gap = wire['shape'].distance(other['shape'])
                if gap < min_gap:
                    min_gap, nearest = gap, other['label']
                strict_shape = wire['shape'].difference(masks[owner]) if owner else wire['shape']
                if not strict_shape.is_empty:
                    strict_other = min(objects, key=lambda o: strict_shape.distance(o['shape']))
                    strict_gap = strict_shape.distance(strict_other['shape'])
                    min_strict_gap = min(min_strict_gap, strict_gap)
                    if strict_gap < job['rule']['clearanceMm'] - 1e-5:
                        fail('signal-spacing', strict_other['label'], gapMm=strict_gap, requiredMm=job['rule']['clearanceMm'])
                if owner:
                    min_launch_pad_gap = min(min_launch_pad_gap, gap)
                    if gap < rules['padToTrace'] - 1e-5:
                        fail('fixed-pad-launch-fabrication', other['label'], gapMm=gap, requiredMm=rules['padToTrace'])
            if not boundary.buffer(-rules['copperToBoardEdge'] + 1e-7).covers(wire['shape']):
                fail('board-edge', 'Wire too close to board edge')
            for v in existing_barrels + barrels:
                if v['net'] == net:
                    continue
                gap = wire['shape'].distance(v['center']) - v['hole']/2
                if gap < rules['viaDrillToTrace'] - 1e-5:
                    fail('via-drill-to-trace', v['label'], gapMm=gap, requiredMm=rules['viaDrillToTrace'])
            for h in plated:
                if h['net'] != net and wire['shape'].distance(h['shape']) < rules['pthDrillToTrace'] - 1e-5:
                    fail('pth-drill-to-trace', h['label'])
            if any(wire['shape'].distance(h) < rules['npthToCopper'] - 1e-5 for h in mechanical):
                fail('mechanical-hole', 'Wire too close to an unplated hole')
            for region in isolation_regions:
                if region['layer'] not in wire['layers']: continue
                gap = wire['shape'].distance(region['shape'])
                if gap <= region['requiredGapMm'] + .0001:
                    fail('preserved-high-speed-isolation', region['name'], gapMm=gap, requiredMm=region['requiredGapMm'])
        for v in own_barrels:
            context = {'via': [v['center'].x, v['center'].y]}
            launch_via = any(mask.covers(v['center']) for mask in masks.values())
            if v['pad'] < rules['viaPadDiameter'] - 1e-7 or v['hole'] < rules['viaHoleDiameter'] - 1e-7 or (v['pad']-v['hole'])/2 < .05-1e-7:
                fail('via-dimensions', v['label'])
            for o in copper + candidate + barrels:
                if o['net'] == net or o['label'] in pours:
                    continue
                gap = v['shape'].distance(o['shape'])
                required = rules['viaToPad'] if o.get('port') else rules['viaToTrace']
                if set(o['layers']) & {'top', 'bottom'} and not launch_via:
                    required = max(required, job['rule']['clearanceMm'])
                if gap < required - 1e-5:
                    fail('via-copper', o['label'], gapMm=gap, requiredMm=required)
                # All internal copper is physically traversed by a through via.
                drill_gap = v['drill'].distance(o['shape'])
                if o.get('trace') or o.get('line'):
                    if drill_gap < rules['viaDrillToTrace'] - 1e-5:
                        fail('via-drill-to-trace', o['label'], gapMm=drill_gap, requiredMm=rules['viaDrillToTrace'])
            for other in existing_barrels + barrels:
                if other is v:
                    continue
                gap = v['center'].distance(other['center']) - (v['hole']+other['hole'])/2
                min_drill = min(min_drill, gap)
                if gap < rules['viaDrillToViaDrill'] - 1e-5:
                    fail('drill-spacing', other['label'], gapMm=gap, requiredMm=rules['viaDrillToViaDrill'])
            for h in plated:
                gap = v['drill'].distance(h['shape'])
                if gap < rules['pthDrillToDrill'] - 1e-5:
                    fail('via-pth-drill-spacing', h['label'], gapMm=gap, requiredMm=rules['pthDrillToDrill'])
            if any(v['shape'].distance(h) < rules['npthToCopper'] - 1e-5 for h in mechanical):
                fail('mechanical-hole', v['label'])
            if not boundary.buffer(-rules['copperToBoardEdge'] + 1e-7).covers(v['shape']):
                fail('board-edge', v['label'])
            for region in isolation_regions:
                gap = v['shape'].distance(region['shape'])
                if gap <= region['requiredGapMm'] + .0001:
                    fail('preserved-high-speed-isolation', region['name'], gapMm=gap, requiredMm=region['requiredGapMm'])
        context = {}
        # Join actual same-net copper on each surface, then bridge surfaces
        # only through a plated barrel. Logical net labels do not join islands.
        regions = []
        for layer in LAYERS:
            shape = unary_union([o['shape'] for o in copper + candidate + barrels if o['net'] == net and layer in o['layers']]).buffer(1e-7)
            regions.extend((layer, p) for p in getattr(shape, 'geoms', [shape]) if not p.is_empty)
        parents = list(range(len(regions)))
        def find(i):
            while parents[i] != i:
                parents[i] = parents[parents[i]]; i = parents[i]
            return i
        for v in [v for v in existing_barrels + barrels if v['net'] == net]:
            touching = [i for i, (_, s) in enumerate(regions) if s.covers(v['center'])]
            for i in touching[1:]: parents[find(i)] = find(touching[0])
        # Through-hole connector pads connect both surfaces too.
        for terminal in job['terminals']:
            if not {'top', 'bottom'}.issubset(terminal['layers']): continue
            at = Point(terminal['x'], terminal['y'])
            touching = [i for i, (_, s) in enumerate(regions) if s.covers(at)]
            for i in touching[1:]: parents[find(i)] = find(touching[0])
        groups = []
        for terminal in job['terminals']:
            at = Point(terminal['x'], terminal['y'])
            touching = [find(i) for i, (l, s) in enumerate(regions) if l in terminal['layers'] and s.covers(at)]
            groups.append(set(touching))
        if not groups or not set.intersection(*groups):
            fail('physical-connectivity', 'Required terminals do not share one conductive copper region')
        length = sum(w['length'] for w in wires)
        # Total tree copper is a conservative upper bound on every path.
        if length > job['rule']['maxLengthMm'] + 1e-6:
            fail('length', 'Total routed tree exceeds configured ceiling', lengthMm=length, requiredMm=job['rule']['maxLengthMm'])
        unsupported, launch_area = 0., 0.
        own_apertures = unary_union([v['center'].buffer(max(v['hole']/2+.215, v['pad']/2+.1), quad_segs=32) for v in own_barrels]
                                    + [h['launch'] for h in plated if h['net'] == net])
        for wire in wires:
            layer = {'top': 'inner1', 'bottom': 'inner4', 'inner2': 'inner1', 'inner3': 'inner4'}.get(wire['layers'][0])
            if layer is None:
                continue  # Invalid reference-plane layers are rejected above.
            ground = unary_union([planned[p['pcb_copper_pour_id']] for p in pours.values() if p['layer'] == layer and root(p['source_net_id']) == nets['GND']])
            void = wire['shape'].difference(ground)
            unsupported += void.difference(own_apertures).area
            launch_area += void.intersection(own_apertures).area
        if unsupported > 1e-7:
            fail('ground-reference', 'Wire crosses unrelated GND openings after planned via antipads', unsupportedAreaMm2=unsupported)
        pad_contacts = []
        if masks:
            for terminal in job['terminals']:
                pads = [o['shape'] for o in copper if terminal.get('pcb_port_id') and o.get('port') == terminal['pcb_port_id']]
                shape = unary_union(pads)
                for trace in result['traces']:
                    points = [p for p in trace['route'] if p['route_type'] == 'wire']
                    for p in ([points[0], points[-1]] if points else []):
                        if p['layer'] in terminal['layers'] and shape.buffer(1e-8).covers(Point(p['x'], p['y'])):
                            contact = {'selector':terminal['selector'],'x':p['x'],'y':p['y'],'layer':p['layer']}
                            if contact not in pad_contacts: pad_contacts.append(contact)
        rows.append({'net': job['name'], 'passed': not failures, 'nativeSolved': True,
                     'minimumForeignCopperGapMm': min_gap if math.isfinite(min_gap) else None,
                     'nearestForeignCopper': nearest, 'requiredGapMm': job['rule']['clearanceMm'],
                     'minimumStrictForeignCopperGapMm': min_strict_gap if math.isfinite(min_strict_gap) else None,
                     'minimumApprovedLaunchPadGapMm': min_launch_pad_gap if math.isfinite(min_launch_pad_gap) else None,
                     'fixedPadLaunchPolicy': job.get('fixedPadLaunchPolicy'),
                     'verifiedTerminalPadContacts': pad_contacts,
                     'minimumViaDrillGapMm': min_drill if math.isfinite(min_drill) else None,
                     'totalTreeCopperLengthMm': length, 'viaCount': len(own_barrels),
                     'unsupportedReferenceAreaMm2': unsupported, 'failureCount': len(failures),
                     'ownViaAndPthLaunchReferenceExclusionAreaMm2': launch_area,
                     'failures': failures[:100]})
    return {'passed': all(r['passed'] for r in rows), 'appliedToBoard': False,
            'configuredNets': len(jobs), 'nativeSolvedNets': sum(r['nativeSolved'] for r in rows),
            'physicalScreenPassedNets': sum(r['passed'] for r in rows), 'nets': rows,
            'remainingIntegrationChecks': ['Fresh source build', 'Native pour refill and prior routing preservation/connectivity',
                                           'Native shorts, PCB style, placement', 'Impedance screen and SPI topology review'],
            'scope': 'Exact signal wires, full-stack via pads and drills, physical terminal continuity, conservative length bound and trace-width GND support with planned antipads. Only explicitly approved CC fixed-pad launch regions use fabrication clearances; signal wire-to-wire, protected high-speed isolation, widths and drill rules are unchanged. No route is applied.'}


if __name__ == '__main__':
    board, jobs, native, output = map(Path, sys.argv[1:5])
    constraints = Path(sys.argv[5]) if len(sys.argv) > 5 else ROOT/'dist/control-routing/pour-obstacles.json'
    cover = json.loads(constraints.read_text())
    if cover.get('sourceSha256') != hashlib.sha256(board.read_bytes()).hexdigest():
        raise ValueError('Isolation constraints are stale or belong to a different board')
    regions = [{**r, 'shape':shapely.from_wkb(bytes.fromhex(r['shapeWkbHex']))} for r in cover['isolationRegions']]
    result = audit(json.loads(board.read_text()), json.loads(jobs.read_text()), json.loads(native.read_text())['results'], regions)
    result['sourceSha256'] = hashlib.sha256(board.read_bytes()).hexdigest()
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(f"Physical candidate screening: {result['physicalScreenPassedNets']}/{result['configuredNets']} nets pass; no board changes applied")
