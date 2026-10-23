"""Check the locality of source changes before reusing focused SI calculations."""
from pathlib import Path
import hashlib
import json
import sys
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'dist/si-channel-review/focused-risks'
OLD = ROOT / 'dist/si-channel-review/selected-stackup-inputs'
NEW = OUT / 'current-inputs'
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from copper_geometry import copper_objects


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def shape(e):
    b = e['brep_shape']
    return Polygon([(p['x'], p['y']) for p in b['outer_ring']['vertices']], [[(p['x'], p['y']) for p in r['vertices']] for r in b.get('inner_rings', [])])


def groups(j):
    keys = {(v['layer'], v.get('source_net_id')) for v in j if v['type'] == 'pcb_copper_pour'}
    return {k: unary_union([shape(v) for v in j if v['type'] == 'pcb_copper_pour' and (v['layer'], v.get('source_net_id')) == k]) for k in keys}


def main():
    a = json.loads((OLD / 'geometry.json').read_text())
    b = json.loads((NEW / 'geometry.json').read_text())
    old_j = json.loads((OLD / 'board.circuit.json').read_text())
    new_file = OUT / 'current-board.circuit.json'
    new_j = json.loads(new_file.read_text())
    ga, gb = groups(old_j), groups(new_j)
    deltas = []
    for k in ga.keys() | gb.keys():
        delta = ga.get(k, Polygon()).symmetric_difference(gb.get(k, Polygon()))
        if delta.area > 1e-8:
            deltas.append((k, delta))
    coppers = copper_objects(new_j)
    channels = []
    for ca, cb in zip(a['channels'], b['channels']):
        assert ca['name'] == cb['name']
        max_residual = 0.
        trace_ids, port_ids = set(), set()
        for pa, pb in zip(ca['conductors'], cb['conductors']):
            assert pa['polarity'] == pb['polarity'] and pa['viaCount'] == pb['viaCount']
            for sa, sb in zip(pa['stages'], pb['stages']):
                assert len(sa['segments']) == len(sb['segments'])
                trace_ids.add(sb['traceId'])
                for va, vb in zip(sa['segments'], sb['segments']):
                    assert va['layer'] == vb['layer']
                    for f in ['widthMm', 'lengthMm']:
                        max_residual = max(max_residual, abs(va[f] - vb[f]))
                    for f in ['from', 'to']:
                        max_residual = max(max_residual, *(abs(va[f][p] - vb[f][p]) for p in ['x', 'y']))
            for p in pb['startPads'] + pb['endPads']:
                port_ids.add(p.get('pcb_port_id'))
            for component in pb['components']:
                for f in ['pads', 'signalPads']:
                    for p in component.get(f, []):
                        port_ids.add(p.get('pcb_port_id'))
        near = []
        for (layer, net), delta in deltas:
            if layer not in ['top', 'bottom']:
                continue
            sig = unary_union([c['shape'] for c in coppers if layer in c['layers'] and (c['trace'] in trace_ids or c['port'] in port_ids)])
            near.append({'layer': layer, 'netId': net, 'minimumDistanceFromChangedCopperMm': delta.distance(sig)})
        channels.append({'name': cb['name'], 'signalRoutesUnchangedTo1eMinus10Mm': max_residual < 1e-10, 'maximumNumericRouteResidualMm': max_residual, 'changedSurfaceCopperDistance': near})
    ground = []
    for layer in ['inner1', 'inner4']:
        ua = unary_union([shape(v) for v in a['groundPlanes'] if v['layer'] == layer])
        ub = unary_union([shape(v) for v in b['groundPlanes'] if v['layer'] == layer])
        ground.append({'layer': layer, 'symmetricDifferenceAreaMm2': ua.symmetric_difference(ub).area})
    via_fields = ['x', 'y', 'hole_diameter', 'outer_diameter', 'layers', 'from_layer', 'to_layer']
    vias_same = [{k: v.get(k) for k in via_fields} for v in a['groundVias']] == [{k: v.get(k) for k in via_fields} for v in b['groundVias']]
    result = {'originalSourceSha256': a['sourceSha256'], 'currentSourceSha256': b['sourceSha256'], 'currentHandoffSha256': sha(NEW / 'field-solver-handoff.json'), 'stackupSha256': sha(OLD / 'selected.json'), 'signalRoutesAllUnchangedTo1eMinus10Mm': all(v['signalRoutesUnchangedTo1eMinus10Mm'] for v in channels), 'allFourCurrentRoutingAuditsPassed': all(v['passed'] for v in b['audits'].values()), 'groundViaGeometryAndOrderUnchanged': vias_same, 'groundPlaneComparison': ground, 'changedCopper': [{'layer': k[0], 'sourceNetId': k[1], 'symmetricDifferenceAreaMm2': s.area, 'boundsMm': list(s.bounds)} for k, s in deltas], 'channels': channels, 'scope': 'Planar route, plane and changed-pour locality check. Similar geometry does not prove unchanged 3D launch fields. The focused numeric calculations retain their original frozen input hashes.', 'inputSha256': {str(p.relative_to(ROOT)): sha(p) for p in [Path(__file__), OLD / 'board.circuit.json', OLD / 'geometry.json', new_file, NEW / 'geometry.json', NEW / 'field-solver-handoff.json']}}
    (OUT / 'current-input-comparison.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ['channels', 'inputSha256']}))


if __name__ == '__main__':
    main()
