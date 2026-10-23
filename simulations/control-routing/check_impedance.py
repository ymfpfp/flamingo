"""Nominal uniform-line screen for emitted ASMedia 50 ohm control routes.

This reuses the independently benchmarked cross-section solver. It does not
qualify vias, pads, corners, loss, crosstalk or fabrication tolerances.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from cross_section import Section, analyze


def audit(raw, jobs, stack):
    if isinstance(raw, dict):
        raw = raw['circuitJson']
    sources = {e['source_trace_id']: e for e in raw if e['type'] == 'source_trace'}
    saved = json.loads((ROOT / 'manufacturing/control-routing/routed-surface.json').read_text())
    top = json.loads((ROOT / 'manufacturing/control-routing/routed-top.json').read_text())
    profile = stack['impedanceProfiles'][0]['calculatorGuideTraceModel']
    dielectric, mask = stack['dielectrics'][0], stack['solderMaskModel']
    base = dict(height=dielectric['thicknessMm'], er=dielectric['designDk'],
                copper=profile['outerCopperThicknessMm'],
                top_width_reduction=profile['topWidthReductionFromBaseMm'],
                mask_er=mask['designDk'], mask_base=mask['aboveSubstrateMm'],
                mask_top=mask['aboveTraceMm'], single=True)
    cases, rows, failures = {}, [], []
    for job in jobs:
        rule = job['rule']
        if 'impedanceOhms' not in rule:
            continue
        names = {s['name'] for n in saved if n['net'] == job['name'] for s in n['segments']}
        names.update(t['name'] for t in top if t['net'] == job['name'])
        if not names:
            continue  # Incomplete nets cannot be claimed by this screen.
        traces = [t for t in raw if t['type'] == 'pcb_trace' and sources[t['source_trace_id']].get('name') in names]
        if len(traces) != len(names):
            failures.append(job['name'] + ': emitted trace inventory is incomplete')
            continue
        widths = sorted({p['width'] for t in traces for p in t['route'] if p['route_type'] == 'wire'})
        layers = sorted({p['layer'] for t in traces for p in t['route'] if p['route_type'] == 'wire'})
        if any(layer not in ['top', 'bottom'] for layer in layers):
            failures.append(job['name'] + ': impedance model does not cover its routing layer')
            continue
        target, tolerance = rule['impedanceOhms'], rule['impedanceTolerancePercent'] / 100
        low, high = target * (1-tolerance), target * (1+tolerance)
        for width in widths:
            if width not in cases:
                results = [analyze(Section(width=width, step=step, **base)) for step in [.002, .001]]
                cases[width] = {'widthMm': width, 'results': results,
                                'meshChangeOhms': abs(results[0]['impedance_ohm']-results[1]['impedance_ohm'])}
            case = cases[width]
            impedance = case['results'][-1]['impedance_ohm']
            passed = low <= impedance <= high and case['meshChangeOhms'] < .2
            if not passed:
                failures.append(f"{job['name']}: {width:g} mm gives {impedance:.3f} ohms; target {low:g}..{high:g}")
            rows.append({'net': job['name'], 'widthMm': width, 'layers': layers,
                         'impedanceOhms': impedance, 'rangeOhms': [low, high], 'passed': passed})
    return {'passed': not failures, 'failures': failures, 'nets': rows, 'crossSections': list(cases.values()),
            'scope': 'Nominal isolated coated microstrip on the symmetric top/L2 and bottom/L5 stackup; actual emitted widths. Vias, pads, corners, nearby copper, loss and fabrication tolerances are excluded.'}


if __name__ == '__main__':
    board, jobs, output = map(Path, sys.argv[1:4])
    stack = ROOT / 'manufacturing/stackup/selected.json'
    result = audit(json.loads(board.read_text()), json.loads(jobs.read_text()), json.loads(stack.read_text()))
    result.update(sourceSha256=hashlib.sha256(board.read_bytes()).hexdigest(),
                  stackupSha256=hashlib.sha256(stack.read_bytes()).hexdigest(),
                  solverSha256=hashlib.sha256((ROOT / 'simulations/pcie-tx/cross_section.py').read_bytes()).hexdigest())
    output.write_text(json.dumps(result, indent=2)+'\n')
    print('Control nominal impedance:', 'PASS' if result['passed'] else 'FAIL')
    for failure in result['failures']:
        print(failure)
    sys.exit(0 if result['passed'] else 1)
