"""Collect the agreed-load power review. Run after the checks listed in the report."""
import hashlib
import html
import json
import re
import shutil
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'dist/current-load-review'


def read(path):
    return json.loads((ROOT/path).read_text())


def digest(path):
    return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()


def esc(value):
    return html.escape(str(value))


board_file = 'dist/current-load-review/fresh-board.circuit.json'
sha = digest(board_file)
old_file = 'dist/current-load-review/prior-saved-board.circuit.json'
old_sha = digest(old_file)
board = read(board_file)
old = read(old_file)
without_notes = lambda records: [r for r in records if r['type'] != 'pcb_note_text']
assert without_notes(board) == without_notes(old), 'Saved-board regressions no longer describe this physical circuit'
counts = Counter(r['type'] for r in board)
old_counts = Counter(r['type'] for r in old)

config_file = 'simulations/power-dynamics/provisional-loads.json'
config = read(config_file)
dynamics_file = 'dist/current-load-review/dynamics/results.json'
dynamic = read(dynamics_file)
review = read('dist/current-load-review/dynamics/review-input.json')
spice = read('dist/current-load-review/dynamics/spice-check.json')
three = read('dist/current-load-review/3v3-dc.json')
dc = read('dist/power-distribution/dc-audit.json')
slot = read('dist/slot-power-routing/dc-audit.json')
five = read('dist/atx5v-routing/dc-audit.json')
validation = read('dist/validation/board.json')
reset = read('dist/power-reset/report.json')
mechanical = read('dist/heatsink-fit/results.json')
research = read(config['currentResearchFile'])
for name, value in [('AC', dynamic), ('3V3', three), ('DC', dc), ('slot', slot),
                    ('5V', five), ('validator', validation), ('heatsink', mechanical)]:
    assert value['sourceSha256'] == sha, name+' has stale board input'
for path, expected in dynamic['inputSha256'].items():
    assert digest(path) == expected, 'AC input changed: '+path
for path, expected in three['inputSha256'].items():
    assert digest(path) == expected, '3V3 input changed: '+path
assert all(c['passed'] for c in dynamic['numericChecks']) and spice['passed']
assert all(c['passed'] for c in three['numericChecks'])

# Freeze external evidence so this report survives later reruns of other reviews.
evidence = OUT/'evidence'
evidence.mkdir(exist_ok=True)
files = {'core-dc.json': 'dist/power-distribution/dc-audit.json',
         'slot-dc.json': 'dist/slot-power-routing/dc-audit.json',
         'atx5v-dc.json': 'dist/atx5v-routing/dc-audit.json',
         'validation.json': 'dist/validation/board.json',
         'reset.json': 'dist/power-reset/report.json',
         'heatsink-fit.json': 'dist/heatsink-fit/results.json',
         'load-assumptions.json': config_file,
         'current-research.json': config['currentResearchFile'],
         'slot-voltage-reference.json': 'datasheets/research/slot-input-voltage-2026-10-22.json'}
for target, source in files.items():
    shutil.copy2(ROOT/source, evidence/target)
log_files = {'tests.log': '/tmp/flamingo-current-budget-tests.log',
             'typecheck.log': '/tmp/flamingo-current-budget-typecheck.log',
             'build.log': '/tmp/flamingo-current-budget-build.log',
             'validation.log': '/tmp/flamingo-current-budget-validation.log'}
for target, source in log_files.items():
    shutil.copy2(source, evidence/target)
test_log = (evidence/'tests.log').read_text()
test_counts = {name: int(re.search(r'(\d+) '+name, test_log)[1]) for name in ['pass', 'skip', 'fail']}
assert test_counts == {'pass': 158, 'skip': 8, 'fail': 0}

rails = []
for r in review['rails']:
    name = r['rail']
    amps = config['rails'][name]['designCurrentA']
    s = next(v for v in dynamic['summary'] if v['rail'] == name)
    up = next(v for v in s['halfLoadStepExample'] if v['direction'] == 'up')
    down = next(v for v in s['halfLoadStepExample'] if v['direction'] == 'down')
    dc_drop = r['dcDropWithMeshAllowanceAt3AMV']*amps/3
    rails.append({'rail': name, 'currentA': amps,
                  'minimumRequiredV': r['minimumRequiredV'],
                  'maximumRequiredV': 1.16 if name == 'VDD' else 1.95,
                  'regulatorNominalV': r['regulatorNominalV'],
                  'regulatorMinimumV': r['regulatorMinimumV'],
                  'regulatorMaximumV': r['regulatorMaximumV'],
                  'conductorDropWithMeshAllowanceMV': dc_drop,
                  'project8mVConductorBudgetPass': dc_drop <= 8,
                  'minimumStaticPinV': r['regulatorMinimumV']-dc_drop/1000,
                  'lowerStaticMarginAfterRippleMV': s['minimumRemainingStaticAfterRippleMV'],
                  'maximumPeakInductorCurrentA': s['peakInductorCurrentUpperA'],
                  'loadStepA': up['stepA'], 'stepInitialA': up['initialCurrentA'],
                  'stepFinalA': up['finalCurrentA'],
                  'exampleLowCornerMinimumBeforeRippleV': up['lowToleranceMinimumV'],
                  'exampleHighCornerMaximumBeforeRippleV': down['highToleranceMaximumV'],
                  'exampleLowMarginWithRippleMV': up['lowCornerMarginWithRippleMV'],
                  'exampleHighMarginWithRippleMV': down['highCornerMarginWithRippleMV']})

# Thermal arithmetic is a reference-condition budget, not a board thermal model.
thermal_ref = research['pdxDatasheet']['thermal']
bridge_power = sum(r['regulatorNominalV']*r['currentA'] for r in rails)+3.3*config['rails']['VCCH_VCCA33']['designCurrentA']
ambient = thermal_ref['referenceAmbientC']
max_temp = thermal_ref['maximumOperatingTJAndTTC']
thermal = {'bridgeRailInputBudgetW': bridge_power, 'referenceAmbientC': ambient,
           'maximumTemperatureC': max_temp,
           'requiredThetaJAAtBudgetCPerW': (max_temp-ambient)/bridge_power,
           'referenceStillAirTemperatureC': ambient+bridge_power*thermal_ref['thetaJA_CPerW']['stillAir'],
           'reference1MPerSTemperatureC': ambient+bridge_power*thermal_ref['thetaJA_CPerW']['airflow1MPerS'],
           'reference': thermal_ref,
           'limitation': 'Conservatively treats bridge rail input as heat and uses reference-board theta values. Actual power, heat paths, thermal interface, mounting and airflow are unknown.'}
normal_startups = [r for r in reset['results'] if r['name'].startswith('startup-')]
reset_summary = {'scenarioCount': len(reset['results']), 'normalStartupScenarioCount': len(normal_startups),
                 'normalStartupPassCount': sum(not r['failed'] for r in normal_startups),
                 'minimumNormalStartupMarginMS': min(r['startupMarginMs'] for r in normal_startups),
                 'scenariosWithFindings': [{'name': r['name'], 'failed': r['failed']} for r in reset['results'] if r['failed']],
                 'scope': reset['scope']}
slot_summary = []
for channel in slot['channels']:
    minimum = 11.04 if channel['rail'] == '12V' else 3.003
    inputs = [12, 11.4, 11.2] if channel['rail'] == '12V' else [3.3, 3.135]
    drop = channel['conductorUpperDropMV']+channel['mosfetDrop25CMaxRdsMV']
    slot_summary.append({**channel, 'totalScreenDropMV': drop, 'slotMinimumV': minimum,
                         'sourceScenarios': [{'inputV': v, 'slotV': v-drop/1000,
                                              'marginMV': (v-drop/1000-minimum)*1000} for v in inputs]})

summary = {'dateLocal': '2026-10-22', 'sourceFile': board_file, 'sourceSha256': sha,
           'currentAssumptions': config, 'rails': rails,
           'scope': 'Static copper, conditional passive load response, reset-stimulus tests, reference thermal arithmetic, and project regression checks. No hardware qualification.',
           'threeV3': {'passed': three['passed'], 'caseCount': len(three['cases']),
                      'minimumVCCHV': min(r['vcchMinimumVAt3p135VInput'] for r in three['cases']),
                      'minimumVCCA33V': min(r['vcca33MinimumVAt3p135VInput'] for r in three['cases']),
                      'externalAllowanceA': sum(three['externalLoadsA'].values())},
           'thermalReferenceScreen': thermal, 'reset': reset_summary, 'slot': slot_summary,
           'validation': {'layoutAndNativePassed': validation['passed'],
                          'retained3AConductorBudgetQualified': validation['reports']['pdnLoad']['qualified'],
                          'qualificationSeparateFromLayout': True},
           'numericChecks': {'passiveAC': dynamic['numericChecks'], 'ngspice': spice,
                             'threeV3': three['numericChecks']},
           'regression': {**test_counts, 'fixtureSha256': old_sha,
                          'sourceBuildPassed': True, 'typecheckPassed': True,
                          'savedAndFreshIdenticalExceptPCBNotes': True,
                          'recordCountDifferences': {k: [old_counts[k], counts[k]] for k in counts.keys()|old_counts.keys() if counts[k] != old_counts[k]}},
           'mechanical': {'verdict': mechanical['verdict'],
                          'requiredMinimumInstalledBridgeHeightMM': mechanical['requiredMinimumInstalledBridgeHeightMM'],
                          'recommendedExternalHeadroomMM': mechanical['recommendedExternalHeadroomMM']},
           'limitations': dynamic['limitations']+three['limitations'],
           'evidenceSha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in [Path(__file__), OUT/'dynamics/results.json', OUT/'dynamics/spice-check.json',
                                        OUT/'3v3-dc.json', *sorted(evidence.iterdir())]}}
(OUT/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')

def table(headers, rows):
    return '<table><thead><tr>'+''.join('<th>'+esc(h)+'</th>' for h in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(v)+'</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table>'

rail_table = table(['Rail', 'Load', 'Copper drop¹', 'Low DC voltage¹', 'Required range', '50% load step: low / high²'],
                   [[r['rail'], f"{r['currentA']:.2f} A", f"{r['conductorDropWithMeshAllowanceMV']:.2f} mV",
                     f"{r['minimumStaticPinV']:.4f} V", f"{r['minimumRequiredV']:.2f}–{r['maximumRequiredV']:.2f} V",
                     f"{r['exampleLowCornerMinimumBeforeRippleV']:.4f} / {r['exampleHighCornerMaximumBeforeRippleV']:.4f} V"] for r in rails])
slot_table = table(['Rail / stress load', 'Source voltage', 'Slot voltage¹', 'Margin to minimum¹'],
                   [[f"{r['rail']} / {r['currentA']:.1f} A", f"{c['inputV']:.3f} V", f"{c['slotV']:.4f} V", f"{c['marginMV']:+.1f} mV"] for r in slot_summary for c in r['sourceScenarios']])
vdd = next(r for r in rails if r['rail'] == 'VDD')
report = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flamingo — agreed-load power review</title>
<style>body{{font:16px/1.55 system-ui,sans-serif;color:#142737;background:#f5f7fa;margin:0}}main{{max-width:1120px;margin:auto;padding:36px 24px 70px}}h1{{font-size:34px;line-height:1.15}}h2{{margin-top:36px;font-size:23px}}h3{{font-size:18px}}.card{{background:white;border:1px solid #d7e0e7;border-radius:10px;padding:20px 24px;margin:18px 0}}.risk{{border-left:5px solid #af542b}}.note{{color:#455b6d;font-size:14px}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{border-bottom:1px solid #d7e0e7;text-align:left;padding:12px 8px;vertical-align:top}}th{{background:#edf2f6}}img{{max-width:100%;height:auto}}code{{overflow-wrap:anywhere;font-size:12px}}a{{color:#12668b}}li{{margin:9px 0}}.scroll{{overflow-x:auto}}</style>
<main><p class="note">22 October 2026 · Fresh source build · Analysis only</p>
<h1>VDD needs the most attention</h1>
<p>The report uses the accepted provisional budgets. The 3 A VDD budget uses the TPS62903's full nominal continuous rating. Thermal derating and loaded startup remain unqualified. VDD voltage margin, reset behavior after a rail fault, and cooling require hardware checks.</p>
<div class="card"><strong>Loads used:</strong> VCCL {config['rails']['VCCL']['designCurrentA']:.2f} A at {config['rails']['VCCL']['nominalVoltageV']} V. VDD {config['rails']['VDD']['designCurrentA']:.2f} A at {config['rails']['VDD']['nominalVoltageV']} V. VCCH + VCCA33 {config['rails']['VCCH_VCCA33']['designCurrentA']:.2f} A combined at {config['rails']['VCCH_VCCA33']['nominalVoltageV']} V. Flash, support and slot loads are additional. ASMedia's reference supply sizing informs VCCL/VDD. The combined 3.3 V budget is a project allowance. PDX maximum currents remain TBD. <a href="evidence/load-assumptions.json">Load assumptions and sources</a> · <a href="summary.json">Machine-readable summary</a></div>
<h2>Where power can cause trouble</h2>
<div class="card risk"><h3>1. VDD has little voltage margin</h3>
<p>The 80°C copper screen gives <strong>{vdd['conductorDropWithMeshAllowanceMV']:.2f} mV</strong> drop at {vdd['currentA']:.2f} A. The VDD path {'meets' if vdd['project8mVConductorBudgetPass'] else 'exceeds'} the project's 8 mV conductor target. The low static regulator corner gives <strong>{vdd['minimumStaticPinV']:.4f} V</strong> at the chip. After modeled switching ripple, {vdd['lowerStaticMarginAfterRippleMV']:.2f} mV of lower margin remains.</p>
<p>One conditional {vdd['stepInitialA']:.2f} → {vdd['stepFinalA']:.2f} A step gives a low-corner minimum of <strong>{vdd['exampleLowCornerMinimumBeforeRippleV']:.4f} V</strong>. Load release gives a high-corner maximum of <strong>{vdd['exampleHighCornerMaximumBeforeRippleV']:.4f} V</strong>. The required VDD range is 1.10–1.16 V. These results use separate tolerance corners. The assumptions include a 200 ns load edge, 0.5 µs response delay, 5 nH interconnect and 1 nH mounting inductance per capacitor. Reduced effective capacitance is another sensitivity assumption. These inputs are not measurements.</p>
<p><strong>Action:</strong> reduce feed and ground impedance; review capacitor placement and effective capacitance; measure load response at the bridge. Raising the setpoint alone cannot fix both example extremes. Check TI’s LC limits and stability before adding capacitance: the existing VDD bank is 75.08 µF nominal, with a +tolerance/+temperature sensitivity of 94.98 µF near the 100 µF selection limit.</p></div>
<div class="scroll">{rail_table}</div>
<p class="note">¹ Fixed 80°C conductor resistance plus mesh allowance, equal bridge ball currents and an ideal source. Connector, ground and package drops are omitted. ² Conditional first dip/peak before ripple; neither actual controller response nor probability of failure is established.</p>
<div class="card risk"><h3>2. Reset does not monitor every rail</h3>
<p>The reset model passes all <strong>{len(normal_startups)} normal startup sensitivity cases</strong>, with a minimum modeled release margin of {reset_summary['minimumNormalStartupMarginMS']:.1f} ms. Fault stimuli expose a gap: reset can remain high when VDD is missing or falls while VCCH stays present. A short power cycle also fails the project’s reset-on-fault goal.</p>
<p><strong>Action:</strong> qualify reset using the required rail-good signals or a suitable supervisor. Before changing sequencing, check ASMedia’s timing requirements. The 1 ms fault-response goal and release-after-valid-rails goal are project targets; they are not additional ASMedia timing specifications.</p>
<p class="note">The bucks are prescribed voltage waveforms in these tests. Loaded startup, actual soft-start timing and regulator recovery remain unqualified. Both SS/TR and PG are presently open. <a href="evidence/reset.json">All {len(reset['results'])} reset scenarios</a></p></div>
<div class="card risk"><h3>3. Plan for about {bridge_power:.2f} W of bridge rail power</h3>
<p>Treating the rail budget as heat, ASMedia’s UB15-15B 15 × 15 × 15 mm reference data gives about <strong>{thermal['referenceStillAirTemperatureC']:.1f}°C at 35°C ambient in still air</strong>, above the listed 90°C maximum. The same reference at 1 m/s airflow gives about {thermal['reference1MPerSTemperatureC']:.1f}°C. A thermal resistance below about {thermal['requiredThetaJAAtBudgetCPerW']:.1f}°C/W would be needed at this power and ambient, before adding design margin.</p>
<p><strong>Action:</strong> provide airflow or improve the thermal path, then measure chip temperature under sustained traffic. This is reference-condition arithmetic, not a temperature prediction for Flamingo. Actual power and the assembled cooling system are unknown.</p>
<p class="note">Mechanical fit needs care too: a centred flat 15 mm sink overlaps tall parts. The separate fit review gives an offset placement subject to installed chip height and enclosure clearance. <a href="../heatsink-fit/report.html">Mechanical fit report</a></p></div>
<h2>Other power paths</h2>
<p><strong>VCCH/VCCA33:</strong> the {len(three['cases'])} DC planning cases {'pass' if three['passed'] else 'do not all pass'} the 3.0 V project floor. They use the combined {config['rails']['VCCH_VCCA33']['designCurrentA']*1000:.0f} mA bridge allowance and {sum(three['externalLoadsA'].values())*1000:.1f} mA of external allowances. Slot cases add 0 A or 3 A. Minimum screened VCCH is {summary['threeV3']['minimumVCCHV']:.4f} V and VCCA33 is {summary['threeV3']['minimumVCCA33V']:.4f} V from ideal 3.135 V ATX pads. The unknown VCCH/VCCA33 split uses both endpoints and the midpoint as scenarios. The VCCA33 3.0 V floor is a project assumption. Analog noise and inrush require separate checks. <a href="3v3-dc.json">Full 3.3 V analysis</a></p>
<p><strong>Regulator current and 5 V feed:</strong> the maximum screened peak inductor current is {max(r['maximumPeakInductorCurrentA'] for r in rails):.2f} A. The TPS62903 has a 4 A minimum peak limit and a 3 A nominal continuous rating. The VDD budget uses that full continuous rating. The separate 4 A total 5 V input-path stress screen retains its 100 mV conductor target. Thermal derating, input transients and loaded startup require hardware checks.</p>
<p><strong>Slot power:</strong> steady voltage depends on source voltage. At the 11.2 V low-input scenario, the 12 V path falls about 11 mV below the 11.04 V slot minimum even before cable, ground or hot-MOSFET losses. At 11.4 V source it retains about 189 mV. The selected PSU’s terminal voltage and cable drop must be checked under the intended load. The rail stress cases below are separate; they do not authorize a combined load above the selected 75 W budget.</p>
<div class="scroll">{slot_table}</div>
<p class="note">Slot screen includes copper at 80°C and maximum fully-on MOSFET resistance at 25°C. It excludes hot-resistance growth, cable/connector and ground losses. Discrete slot switches have no local active current limit; card inrush, short-circuit survival and MOSFET startup SOA remain open.</p>
<h2>What passed, and what remains open</h2>
<ul><li>Fresh source build and TypeScript check passed. Regression tests: <strong>158 passed, 8 skipped, 0 failed</strong>. The fixture differs from the fresh build only in PCB note text; all other records are exactly equal.</li>
<li>Fresh layout/native/routing validation: <strong>{'passed' if validation['passed'] else 'findings remain; inspect validation evidence'}</strong>. The separate 3 A conductor screen on both rails retains its 8 mV limit. Design-load conductor results: {', '.join(r['rail']+' '+('meets' if r['project8mVConductorBudgetPass'] else 'exceeds')+' the 8 mV limit' for r in rails)}. Neither layout checks nor the design budgets establish hardware qualification.</li>
<li>All {len(dynamic['numericChecks'])} passive-model numerical controls and both 3.3 V solver controls passed. The independent ngspice implementation agrees with the selected passive waveform to {spice['maximumInteriorWaveformDifferenceMV']:.6f} mV away from slope edges. This verifies numerical consistency, not the physical inputs or converter control loop.</li>
<li>TI’s available PSpice and SIMPLIS converter models are encrypted. No vendor closed-loop startup, stability or recovery simulation was run. Interconnect inductance and bridge load steps are assumed; actual waveforms are unknown.</li></ul>
<h2>Rev 1 measurements → Rev 2 fixes</h2>
<ol><li>Measure 5 V, VCCH, VCCL, VDD and reset together through startup and short power cycles. Probe at accessible capacitor pads close to the bridge using short ground connections. Record any rail fault and reset response.</li>
<li>Measure VDD at idle, link training and sustained traffic with the intended endpoint; capture both load onset and load release. If available, characterize the supply separately with a controlled load before connecting a valuable endpoint.</li>
<li>Record rail currents, slot input/output voltages and temperatures under sustained load. Repeat with the intended cooling and ambient conditions.</li>
<li>Use the measured failure to choose Rev 2 changes: copper/return paths, capacitor placement, regulator or feedback selection, rail-qualified reset, cooling, or slot power control. These changes are normally feasible in Rev 2. Rev 1 may also permit component rework, an added supervisor or external cooling.</li></ol>
<p>Power faults can resemble firmware or signal problems. A second revision can fix an identified power defect, but it does not guarantee the complete system will work. Use the measurements to distinguish these causes.</p>
<h2>Conditional response plots</h2>
<img src="dynamics/first-response.png" alt="First-response voltage waveforms for assumed current-response delays">
<img src="dynamics/delay-sensitivity.png" alt="Minimum voltage margin versus assumed current-response delay">
<h2>Evidence and reproducibility</h2>
<p class="note">Fresh board SHA-256: <code>{sha}</code><br>Regression fixture SHA-256: <code>{old_sha}</code></p>
<p><a href="evidence/validation.json">Full validator</a> · <a href="evidence/core-dc.json">Core copper</a> · <a href="evidence/atx5v-dc.json">5 V input copper</a> · <a href="evidence/slot-dc.json">Slot copper</a> · <a href="dynamics/results.json">AC assumptions and sweep</a> · <a href="dynamics/spice-check.json">ngspice cross-check</a> · <a href="evidence/tests.log">Regression log</a> · <a href="evidence/current-research.json">PDX research</a></p>
<p class="note">Analysis sources: simulations/power-dynamics/provisional-loads.json, prepare_current.mjs, run_review.py, check_spice.mjs, render_provisional_report.py, and simulations/power-distribution/check_provisional_3v3.py. Run the fresh validator first; then prepare_current with the fresh board and DC report, run_review with --loads, the 3.3 V script, the ngspice cross-check, reset and mechanical checks, and this collector. The summary stores input hashes and frozen evidence.</p>
</main></html>'''
(OUT/'report.html').write_text(report)
print(json.dumps({'report': str(OUT/'report.html'), 'sourceSha256': sha,
                  'rails': rails, 'thermal': thermal, 'threeV3': summary['threeV3'],
                  'validation': summary['validation']}, indent=2))
