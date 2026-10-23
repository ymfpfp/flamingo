"""DC screen of the accepted combined bridge budget plus external 3.3 V loads.

Uses the existing emitted-copper sheet solver. VCCH and VCCA33 remain separate
nets; the zero-ohm link is added as a component resistance after the solve.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from check_layout import model, ROOT
from check_slot_dc import solve

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source')
parser.add_argument('--out', default='dist/current-load-review/3v3-dc.json')
args = parser.parse_args()
source = Path(args.source)
raw = source.read_bytes()
board = json.loads(raw)
j, sc, sp, pp, st, vias, pours, copper, nets, root, via_net, port = model(board)
loads_file = ROOT/'simulations/power-dynamics/provisional-loads.json'
budget = json.loads(loads_file.read_text())['rails']['VCCH_VCCA33']['designCurrentA']
bridge_pins = [p['port_hints'][-1] for p in sp.values()
               if sc.get(p.get('source_component_id'), {}).get('name') == 'ASM2464PDX'
               and 'VCCH' in p.get('port_hints', [])]
assert len(bridge_pins) == 11
feeds = [('ATX', 'pin'+str(i)) for i in [1, 2, 12, 13]]

# Bound each directly supplied pull-up by pulling its opposite end to ground.
# This intentionally overstates the divider and reset steady current. It is
# not an input-capacitor inrush or arbitrary external programmer load model.
external = {'W25Q32JVSSIQ.pin8': .025, 'U_BUCK_EN.VDD': .001}
for p in pp.values():
    s = sp.get(p.get('source_port_id'), {})
    c = sc.get(s.get('source_component_id'), {})
    resistance = c.get('resistance', 0)
    if c.get('ftype') == 'simple_resistor' and resistance > 0 and root(s['source_port_id']) == nets['VCCH']:
        external[c['name']+'.'+s['port_hints'][-1]] = 3.6/(resistance*.99)

def screen(case, currents=None):
    coarse = solve(board, case, .09, load_currents_a=currents, reuse_mesh=True)
    fine = solve(board, case, .06, load_currents_a=currents, reuse_mesh=True)
    allowance = max(abs(coarse['dropMV']-fine['dropMV']), .25*fine['dropMV'])
    return {'coarse': coarse, 'fine': fine,
            'meshAllowanceMV': allowance, 'screeningDropMV': max(coarse['dropMV'], fine['dropMV'])+allowance}

analog = screen(('VCCA33', [('R_VCCA33_4', 'pin2')], [('ASM2464PDX', 'H5')], budget))
cases = []
for analog_fraction in [0, .5, 1]:
    for slot_current in [0, 3]:
        currents = dict(external)
        for pin in bridge_pins:
            currents['ASM2464PDX.'+pin] = budget*(1-analog_fraction)/len(bridge_pins)
        currents['R_VCCA33_4.pin1'] = budget*analog_fraction
        for pin in [1, 2, 3]:
            currents['Q_SLOT_3V3.pin'+str(pin)] = slot_current/3
        terminals = [tuple(name.rsplit('.', 1)) for name in currents]
        vcch = screen(('VCCH', feeds, terminals, sum(currents.values())), currents)
        # Use the largest terminal drop to bound the upstream voltage of both
        # domains. Analog downstream copper is evaluated at the all-analog
        # endpoint then scaled, which is exact for this resistor model.
        vcch_drop = vcch['screeningDropMV']
        jumper_drop = budget*analog_fraction*.05*1000
        analog_drop = vcch_drop+jumper_drop+analog['screeningDropMV']*analog_fraction
        cases.append({'analogFractionOfBridgeAllowance': analog_fraction, 'slot3V3CurrentA': slot_current,
                      'bridgeTotalCurrentA': budget, 'externalBudgetCurrentA': sum(external.values()),
                      'totalSourceCurrentA': sum(currents.values()), 'terminalCurrentsA': currents,
                      'vcch': vcch, 'analogJumperDropMV': jumper_drop,
                      'vcca33TotalDropMV': analog_drop,
                      'vcchMinimumVAt3p135VInput': 3.135-vcch_drop/1000,
                      'vcca33MinimumVAt3p135VInput': 3.135-analog_drop/1000,
                      'vcchOperatingMinimumPass': 3.135-vcch_drop/1000 >= 3.0,
                      'vcca33Assumed3V0FloorPass': 3.135-analog_drop/1000 >= 3.0})
        print('3.3 V case:', analog_fraction, 'analog fraction,', slot_current, 'A slot;',
              round(vcch_drop, 3), 'mV VCCH,', round(analog_drop, 3), 'mV analog total', flush=True)

# Check that explicit equal terminal currents preserve the existing solver.
reference_case = ('VCCA33', [('R_VCCA33_4', 'pin2')], [('ASM2464PDX', 'H5')], budget)
explicit = solve(board, reference_case, .09, load_currents_a={'ASM2464PDX.H5': budget}, reuse_mesh=True)
equal_difference = abs(explicit['dropMV']-analog['coarse']['dropMV'])
scaled = solve(board, ('VCCA33', reference_case[1], reference_case[2], budget*2), .09,
               load_currents_a={'ASM2464PDX.H5': budget*2}, reuse_mesh=True)
linearity_difference = abs(scaled['dropMV']-2*explicit['dropMV'])
checks = [{'name': 'Explicit and default equal-current boundary agree', 'errorMV': equal_difference,
           'passed': equal_difference < 1e-8},
          {'name': 'Fixed-resistance current scaling', 'errorMV': linearity_difference,
           'passed': linearity_difference < 1e-8}]
reuse_error = max(r['meshReuse']['coldVsReusedFactorizationErrorMV']
                  for screen_result in [analog]+[c['vcch'] for c in cases]
                  for r in [screen_result['coarse'],screen_result['fine']])
checks.append({'name': 'Cold solve and reused matrix factorization agree', 'errorMV': reuse_error,
               'passed': reuse_error < 1e-8})
assert all(c['passed'] for c in checks)
result = {'sourceFile': str(source), 'sourceSha256': hashlib.sha256(raw).hexdigest(),
          'dateLocal': '2026-10-22', 'bridgeCombinedAllowanceA': budget, 'externalLoadsA': external,
          'analogCopperAtFullAllowance': analog, 'cases': cases, 'numericChecks': checks,
          'passed': all(c['vcchOperatingMinimumPass'] and c['vcca33Assumed3V0FloorPass'] for c in cases),
          'scope': '80 C fixed-temperature emitted-copper DC mesh; ideal 3.135 V at ATX feed pads; flash 25 mA maximum operation budget, 1 mA supervisor allowance and grounded-opposite-end pull-up bounds; 0 A and 3 A slot cases.',
          'limitations': [
              'VCCH/VCCA33 split is unknown; endpoints and midpoint are planning scenarios. Equal current across VCCH balls is assumed.',
              'VCCA33 3.0 V floor follows the 3.3 V-domain project screen; the PDX current table does not supply an independent VCCA33 specification.',
              '50 milliohm jumper resistance is the manufacturer family limit, without a separate hot-resistance model.',
              'Ground, connector/cable, semiconductor package, AC noise, capacitor charging and arbitrary programming-header loads are omitted.',
              'Bridge internal currents and external pin loading are not measured.'],
          'references': ['datasheets/W25Q32JV.pdf DC electrical characteristics',
                         'datasheets/0402WGF1003TCE.pdf section 7, 0402 jumper resistance <50 milliohm',
                         'datasheets/ASM2464PDX_DataSheet_R0_3.pdf section 6.2'],
          'inputSha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in [Path(__file__), loads_file, ROOT/'simulations/power-distribution/check_slot_dc.py',
                                    ROOT/'manufacturing/stackup/selected.json']}}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2)+'\n')
print(out, flush=True)
