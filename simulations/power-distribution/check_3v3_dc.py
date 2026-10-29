"""Supplemental 3.3 V DC screen; uses the existing physical copper solver."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/power-distribution'))
from check_slot_dc import solve
from check_layout import model

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('--slot-report', type=Path, default=ROOT/'dist/slot-power-routing/dc-audit.json')
parser.add_argument('--output', type=Path, default=ROOT/'dist/vcch-routing/dc-audit.json')
args = parser.parse_args()
source = args.source
raw = source.read_bytes()
board = json.loads(raw)
planning = json.loads((ROOT/'simulations/power-dynamics/provisional-loads.json').read_text())
assert planning['rails']['VCCH_VCCA33']['designCurrentA'] == .1, 'Update the corner cases for the changed bridge allowance'
bridge = [('ASM2464PDX', p) for p in ['D6', 'D8', 'D9', 'D13', 'E6', 'E8', 'E9', 'E13', 'F6', 'F13', 'H6']]
analog_feed = ('R_VCCA33_4', 'pin1')
switch = [('Q_SLOT_3V3', 'pin' + str(p)) for p in [1, 2, 3]]
_, sc, sp, pp, _, _, _, _, nets, root, _, _ = model(board)
# Same flash, supervisor and worst-case pull-up budgets as the existing
# provisional bridge screen. An external programmer is outside this budget.
external = {'W25Q32JVSSIQ.pin8': .025, 'U_BUCK_EN.VDD': .001}
for p in pp.values():
    s = sp.get(p.get('source_port_id'), {})
    c = sc.get(s.get('source_component_id'), {})
    resistance = c.get('resistance', 0)
    if c.get('ftype') == 'simple_resistor' and resistance > 0 and root(s['source_port_id']) == nets['VCCH']:
        external[c['name']+'.'+s['port_hints'][-1]] = 3.6/(resistance*.99)
external_amps = sum(external.values())
loads = bridge + [analog_feed] + switch + [tuple(n.rsplit('.', 1)) for n in external]
feeds = [('ATX', 'pin' + str(p)) for p in [1, 2, 12, 13]]
results = []
for mesh in [.2, .08]:
    cases = []
    # An affine DC model reaches its maximum at a vertex of the allowed
    # nonnegative current simplex. Check all 12 possible bridge-current sinks.
    # Slot-source pad currents retain the existing equal-sharing assumption.
    for terminal in bridge + [analog_feed]:
        currents = {p + '.' + pin: (1. if (p, pin) in switch else .1 if (p, pin) == terminal else 0.) for p, pin in loads}
        currents.update(external)
        result = solve(board, ('VCCH', feeds, loads, 3.1+external_amps), mesh,
                       load_currents_a=currents, reuse_mesh=True)
        cases.append(dict(bridgeCurrentSink='.'.join(terminal), **result))
    # Also check bridge-only loading, with the slot drawing zero.
    bridge_only = []
    for terminal in bridge + [analog_feed]:
        currents = {p + '.' + pin: (.1 if (p, pin) == terminal else 0.) for p, pin in loads}
        currents.update(external)
        result = solve(board, ('VCCH', feeds, loads, .1+external_amps), mesh,
                       load_currents_a=currents, reuse_mesh=True)
        bridge_only.append(dict(bridgeCurrentSink='.'.join(terminal), **result))
    analog = solve(board, ('VCCA33', [('R_VCCA33_4', 'pin2')], [('ASM2464PDX', 'H5')], .1), mesh)
    results.append(dict(gridMm=mesh, slot3AAndBridge100mA=cases, bridgeOnly100mA=bridge_only, analogCopper100mA=analog))
    print('Mesh', mesh, 'mm complete', flush=True)

def allowance(values):
    coarse, fine = values
    return max(values) + max(abs(coarse-fine), .25*fine)

summary = {}
for key in ['slot3AAndBridge100mA', 'bridgeOnly100mA']:
    for group, names in [('bridgeVCCH', ['.'.join(t) for t in bridge]), ('analogInput', ['.'.join(analog_feed)]), ('slotSwitchSource', ['.'.join(t) for t in switch])]:
        values = [max(c['terminalsMV'][n] for c in mesh[key] for n in names) for mesh in results]
        summary[key + '_' + group + '_conductorUpperMV'] = allowance(values)
analog_upper = allowance([r['analogCopper100mA']['dropMV'] for r in results])
summary['analogCopper100mA_conductorUpperMV'] = analog_upper
for key in ['slot3AAndBridge100mA', 'bridgeOnly100mA']:
    summary[key + '_analogPin_excluding0OhmLinkMV'] = summary[key + '_analogInput_conductorUpperMV'] + analog_upper

slot = json.loads(args.slot_report.read_text())
assert slot['sourceSha256'] == hashlib.sha256(raw).hexdigest()
assert slot['stackupSha256'] == hashlib.sha256((ROOT/'manufacturing/stackup/selected.json').read_bytes()).hexdigest()
out = next(r['withMeshAllowanceMV'] for r in slot['results'] if r['rail'] == 'SLOT_3V3')
mosfet = next(c['mosfetDrop25CMaxRdsMV'] for c in slot['channels'] if c['rail'] == '3V3')
total = summary['slot3AAndBridge100mA_slotSwitchSource_conductorUpperMV'] + out + mosfet
summary.update(slot3AAndBridge100mA_slotDropIncluding25CFetMV=total,
               slotVoltageFromNominal3p3V=3.3-total/1000,
               slotVoltageFromATXMinus5PercentV=3.3*.95-total/1000,
               slotMinimumFromCEM9PercentV=3.3*.91,
               slotMarginFromATXMinus5PercentMV=(3.3*.95-3.3*.91)*1000-total,
               slotOutputCopperUpperMV=out, mosfet25CMaxRdsDropMV=mosfet)
summary['slotLowInputDcScreenPassed'] = summary['slotMarginFromATXMinus5PercentMV'] >= 0
summary['slotMarginWith2xFetResistanceSensitivityMV'] = summary['slotMarginFromATXMinus5PercentMV'] - mosfet
report = dict(status='DC screen complete; full voltage qualification open', sourceFile=str(source),
              passed=summary['slotLowInputDcScreenPassed'],
              sourceSha256=hashlib.sha256(raw).hexdigest(), scriptSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              stackupCode=slot['stackupCode'],stackupSha256=slot['stackupSha256'],
              currentAssumptions=dict(slotA=3., bridgeCombinedA=.1, bridgeSplit='all 12 nonnegative current vertices checked'),
              externalLoadsA=external,
              summary=summary, meshes=results,
              sources=[dict(url='https://edc.intel.com/content/www/us/en/design/ipla/software-development-platforms/client/platforms/alder-lake-desktop/atx-version-3-0-multi-rail-desktop-platform-power-supply-design-guide/2.0/2.1/dc-voltage-regulation-required/', section='Table 4-2: 3.3 V +/-5%, published endpoints rounded to 3.14 and 3.47 V; regulation at load end of PSU output connectors'),
                       dict(url='https://www.ti.com/lit/ds/symlink/tps2363.pdf', section='Table 1: CEM 3.3 V +/-9% and 3 A'),
                       dict(file='datasheets/ASM2464PDX_DataSheet_R0_3.pdf', section='6.2: VCCH 3.0 to 3.6 V; no separate VCCA33 range shown')],
              limitations=['Conductor-only DC model at 80 C; 25% minimum mesh allowance is a numerical estimate, not a proven error bound.',
                           '100 mA combined bridge allowance is a project assumption, not a verified ASMedia maximum.',
                           'Actual 0-ohm link resistance and its temperature rise are excluded from analog voltage.',
                           'Arbitrary programming load, ground-return loss, contact resistance, ripple and transients are excluded. Flash, supervisor and worst-case pull-up allowances are included. A 2x MOSFET resistance sensitivity is reported separately, not a guaranteed hot-Rds bound.',
                           'ATX supply tolerance is specified at the load end of PSU connectors; do not count compliant PSU cable loss a second time.',
                           'All ATX feed pads are held at the same voltage. Slot switch source pads use equal currents. Actual current sharing can differ.',
                           'The 8 mV VCCL/VDD design criterion does not apply to the separate 3.3 V slot path.'])
dest = args.output
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(summary, indent=2), flush=True)
sys.exit(0 if report['passed'] else 1)
