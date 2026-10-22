"""Independent exact surface-wire check of native routing candidates.

No copper is applied here. Six-layer via/drill/plane checks and impedance
qualification remain separate acceptance requirements.
"""
import json, sys
from pathlib import Path
from shapely.geometry import LineString

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/power-distribution'))
from check_layout import model


def audit(raw, jobs, results):
    j, sc, sp, pp, st, vias, pours, copper, nets, root, via_net, port = model(raw)
    by_name = {job['name']: job for job in jobs}
    candidate = []
    for result in results:
        if not result.get('solved'):
            continue
        job = by_name[result['net']]
        net = root(job['terminals'][0]['sourcePortId'])
        for trace in result['traces']:
            for a, b in zip(trace['route'], trace['route'][1:]):
                if a['route_type'] != 'wire' or b['route_type'] != 'wire' or a['layer'] != b['layer']:
                    continue
                line = LineString([(a['x'], a['y']), (b['x'], b['y'])])
                if line.length < 1e-8:
                    continue
                candidate.append({'net': net, 'name': job['name'], 'layers': [a['layer']],
                                  'shape': line.buffer(max(a['width'], b['width']) / 2, quad_segs=32),
                                  'minimumWidthMm': min(a['width'], b['width']), 'lengthMm': line.length})
    rows = []
    for result in results:
        if not result.get('solved'):
            continue
        job = by_name[result['net']]
        net = root(job['terminals'][0]['sourcePortId'])
        minimum, width, length = 999., 999., 0.
        for wire in [c for c in candidate if c['name'] == job['name']]:
            foreign = [o for o in copper + candidate if o['net'] != net and set(o['layers']) & set(wire['layers'])]
            minimum = min(minimum, min((wire['shape'].distance(o['shape']) for o in foreign), default=999))
            width = min(width, wire['minimumWidthMm'])
            length += wire['lengthMm']
        failures = []
        if width < job['rule']['widthMm'] - 1e-7:
            failures.append('Trace width below configured target')
        if minimum < job['rule']['clearanceMm'] - 1e-5:
            failures.append(f"Surface wire spacing {minimum:.6f} mm below {job['rule']['clearanceMm']} mm target")
        rows.append({'net': job['name'], 'passed': not failures, 'failures': failures,
                     'minimumForeignCopperGapMm': minimum, 'requiredGapMm': job['rule']['clearanceMm'],
                     'minimumWidthMm': width, 'copperLengthMm': length})
    return {'passed': all(r['passed'] for r in rows), 'nets': rows,
            'scope': 'Exact emitted surface-wire widths and foreign-copper spacing, including round caps and other candidates. Full-stack via/drill, pour continuity, topology, length and impedance qualification remain pending.',
            'appliedToBoard': False}


if __name__ == '__main__':
    board, jobs, native, output = map(Path, sys.argv[1:5])
    result = audit(json.loads(board.read_text()), json.loads(jobs.read_text()), json.loads(native.read_text())['results'])
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(f"Independent surface-wire checks: {sum(r['passed'] for r in result['nets'])}/{len(result['nets'])} candidates pass")
