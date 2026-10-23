"""Compare hypothetical power changes with the accepted-load passive model.

The baseline runner supplies numerical controls and an independent SPICE deck.
Variants change model parameters only. They do not modify the board or model
the TPS62903 control loop, ground return, package, or thermal behavior.
"""
import argparse
import copy
import hashlib
import itertools
import json
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--review', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--loads', default='simulations/power-dynamics/provisional-loads.json')
args = parser.parse_args()
original_argv = sys.argv[:]
try:
    sys.argv = ['run_review.py', '--review', args.review, '--out', args.out, '--loads', args.loads]
    model = runpy.run_path(str(Path(__file__).with_name('run_review.py')), run_name='__main__')
finally:
    sys.argv = original_argv

variants = [
    dict(name='Existing circuit assumptions', resistanceScale=1, linkNH=5, mountNH=1, delayUS=.5),
    dict(name='Half feed resistance target', resistanceScale=.5, linkNH=5, mountNH=1, delayUS=.5),
    dict(name='Quarter feed resistance target', resistanceScale=.25, linkNH=5, mountNH=1, delayUS=.5),
    dict(name='Lower interconnect inductance target', resistanceScale=1, linkNH=1, mountNH=.2, delayUS=.5),
    dict(name='Half resistance and lower inductance', resistanceScale=.5, linkNH=1, mountNH=.2, delayUS=.5),
    dict(name='VDD feedback trim to 10.9 kohm', resistanceScale=1, linkNH=5, mountNH=1, delayUS=.5, trimVDD=True),
    dict(name='VDD trim plus half resistance and lower inductance', resistanceScale=.5, linkNH=1, mountNH=.2, delayUS=.5, trimVDD=True),
    dict(name='Hypothetical faster current response', resistanceScale=1, linkNH=5, mountNH=1, delayUS=.2),
]
rows = []
for original, variant, profile in itertools.product(model['rail_inputs'], variants, ['typical_dc', 'low_ac_sensitivity']):
    if variant.get('trimVDD') and original['rail'] != 'VDD':
        continue
    rail = copy.deepcopy(original)
    rail['linkResistanceOhm'] *= variant['resistanceScale']
    if variant.get('trimVDD'):
        top, bottom = 10900, 12100
        error = .001 + 25e-6 * 125
        rail['regulatorNominalV'] = .6 * (1 + top / bottom)
        rail['regulatorMinimumV'] = .6 * .991 * (1 + top * (1-error) / (bottom * (1+error))) - 70e-9 * top * (1+error)
        rail['regulatorMaximumV'] = .6 * 1.009 * (1 + top * (1+error) / (bottom * (1-error))) + 70e-9 * top * (1+error)
    ripple = [model['ripple'](rail, profile, variant['linkNH'], variant['mountNH'], vin, inductance, frequency)
              for vin, inductance, frequency in itertools.product([4.75, 5.25], [.72e-6, 1.2e-6], [2.25e6, 2.75e6])]
    trough = max(c['loadTroughMV'] for c in ripple)
    peak = max(c['loadPeakMV'] for c in ripple)
    up = model['transient'](rail, profile, variant['linkNH'], variant['mountNH'], .5, variant['delayUS'], 'up')
    down = model['transient'](rail, profile, variant['linkNH'], variant['mountNH'], .5, variant['delayUS'], 'down')
    low = up['lowToleranceMinimumV'] - trough / 1000
    high = down['highToleranceMaximumV'] + peak / 1000
    rows.append(dict(rail=rail['rail'], variant=variant, profile=profile,
                     designCurrentA=rail['currentA'], nominalSetpointV=rail['regulatorNominalV'],
                     staticRegulatorMinimumV=rail['regulatorMinimumV'], staticRegulatorMaximumV=rail['regulatorMaximumV'],
                     feedResistanceOhm=rail['linkResistanceOhm'],
                     conductorDropMV=rail['linkResistanceOhm'] * rail['currentA'] * 1000,
                     effectiveCapacitanceUF=up['effectiveCapacitanceUF'],
                     minimumIncludingSelectedRippleV=low, maximumIncludingSelectedRippleV=high,
                     lowerMarginMV=(low-rail['minimumRequiredV']) * 1000,
                     upperMarginMV=(rail['requiredMaximumV']-high) * 1000,
                     conditionalVoltageWindowPass=low >= rail['minimumRequiredV'] and high <= rail['requiredMaximumV'],
                     up=up, down=down, rippleTroughMV=trough, ripplePeakMV=peak))

baseline = json.loads((ROOT / args.out / 'results.json').read_text())
report = dict(sourceSha256=baseline['sourceSha256'], currentAssumptions=baseline['currentAssumptions'],
              scope='Hypothetical parameter targets, not circuit modifications or validated regulator responses.',
              cases=rows, limitations=[
                  'All cases use an assumed 50%-to-100% load increase and matching release with a 200 ns edge.',
                  'The response delay and fastest ideal buck slew are prescribed. They do not predict the actual TPS62903 waveform.',
                  'Resistance changes are targets for unchanged-temperature conductor loss. No new copper geometry is evaluated.',
                  'Interconnect and mounting inductances are assumed. No package, ground or field extraction is included.',
                  'Feedback-trim cases include the existing reference accuracy, resistor tolerance, TCR and leakage assumptions.',
                  'The two voltage corners are separate extremes. A passing case is not hardware qualification.',
                  'No extra capacitance is added. Stability and the vendor LC selection limits still require separate checks.',
              ], inputSha256={str(Path(__file__).relative_to(ROOT)): hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                              str(Path(args.out) / 'results.json'): hashlib.sha256((ROOT / args.out / 'results.json').read_bytes()).hexdigest()})
target = ROOT / args.out / 'improvement-sweep.json'
target.write_text(json.dumps(report, indent=2)+'\n')
print('Improvement sensitivity cases:', len(rows), target, flush=True)
