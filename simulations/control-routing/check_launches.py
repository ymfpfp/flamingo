"""Read-only launch feasibility screen; this module performs no routing.

The full trace width/spacing is checked at each top-side terminal. A failure
means that a direct, full-width top escape needs separate fanout treatment.
It does not prove that an alternate via/launch topology is impossible.
"""
import json, sys
from pathlib import Path
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/power-distribution'))
from check_layout import model


def audit(raw, jobs):
    j, sc, sp, pp, st, vias, pours, copper, nets, root, via_net, port = model(raw)
    rows = []
    for job in jobs:
        gap = job['rule']['clearanceMm']
        radius = job['rule']['widthMm'] / 2
        terminals = []
        for terminal in job['terminals']:
            p = pp[terminal['pcb_port_id']]
            n = root(p['source_port_id'])
            launch = Point(p['x'], p['y']).buffer(radius, quad_segs=32)
            foreign = [o for o in copper if o['net'] != n and 'top' in o['layers']]
            nearest = min(foreign, key=lambda o: launch.distance(o['shape']))
            distance = launch.distance(nearest['shape'])
            terminals.append({
                'selector': terminal['selector'],
                'topLaunchClear': distance >= gap - 1e-5,
                'availableGapMm': distance,
                'requiredGapMm': gap,
                'nearestForeignCopper': nearest['label'],
            })
        rows.append({'name': job['name'], 'terminals': terminals,
                     'directTopLaunchesClear': all(t['topLaunchClear'] for t in terminals)})
    return {'status': 'screen-completed', 'nets': rows,
            'blockedDirectTopLaunches': sum(not t['topLaunchClear'] for r in rows for t in r['terminals']),
            'scope': 'Advisory full-width top launch screen. It never excludes a net from automatic multilayer routing or requires manual fanout. No clearance exception is granted. This is not completed routing, impedance verification or an all-layer via DRC.'}


if __name__ == '__main__':
    board, jobs, output = map(Path, sys.argv[1:4])
    result = audit(json.loads(board.read_text()), json.loads(jobs.read_text()))
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(f"Control launch screen: {result['blockedDirectTopLaunches']} advisory direct-top warnings; all nets remain enabled for automatic routing")
