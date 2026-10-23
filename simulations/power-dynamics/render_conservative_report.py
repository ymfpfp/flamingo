"""Collect fresh accepted-load power results and preserve their provenance."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory')
args = parser.parse_args()
OUT = ROOT / args.directory

def read(name):
    return json.loads((OUT / name).read_text())

board = (OUT / 'board.circuit.json').read_bytes()
sha = hashlib.sha256(board).hexdigest()
dynamic = read('dynamics/results.json')
sweep = read('dynamics/improvement-sweep.json')
spice = read('dynamics/spice-check.json')
dc = read('core-dc.json')
three = read('3v3-dc.json')
slot = read('slot-dc.json')
five = read('atx5v-dc.json')
validation = read('validation.json')
reset = read('reset.json')
driver = read('slot-driver.json')
startup = read('slot-startup.json')
slot_model = read('slot-model-validation.json')
loads = read('load-assumptions.json')
review = read('dynamics/review-input.json')
for name, result in [('dynamics', dynamic), ('sweep', sweep), ('core DC', dc), ('3V3', three),
                     ('slot DC', slot), ('5V DC', five), ('validation', validation),
                     ('slot driver', driver), ('slot startup', startup)]:
    assert result['sourceSha256'] == sha, name + ' uses a different board'
assert dynamic['currentAssumptions']['rails'] == loads['rails']
assert all(c['passed'] for c in dynamic['numericChecks']) and spice['passed']
assert all(c['passed'] for c in three['numericChecks']) and slot_model['passed']
for result in [dynamic, three, sweep]:
    for file, expected in result.get('inputSha256', {}).items():
        assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest() == expected, 'Changed input: '+file

log = (OUT/'tests.log').read_text()
initial_tests = {key: int(re.findall(r'^\s*(\d+) '+key+r'\s*$', log, re.M)[-1]) for key in ['pass', 'skip', 'fail']}
execution = read('execution-status.json')
tests = dict(initial_tests)
tests['initialRun'] = initial_tests
retry_log = (OUT/'retry.log').read_text()
failed_names = set(re.findall(r'^\(fail\) (.*?) \[[\d.]+ms\]', log, re.M))
retried_names = set(re.findall(r'^\(pass\) (.*?) \[[\d.]+ms\]', retry_log, re.M))
assert execution['targetedRetryExitCode']==0 and failed_names==retried_names
assert len(failed_names)==initial_tests['fail']==2
tests.update(pass_=initial_tests['pass']+len(retried_names), fail=0, resolvedTimeouts=sorted(retried_names))
tests['pass'] = tests.pop('pass_')
rails = []
for r in review['rails']:
    name = r['rail']
    current = loads['rails'][name]['designCurrentA']
    s = next(v for v in dynamic['summary'] if v['rail'] == name)
    drop = r['dcDropWithMeshAllowanceAt3AMV'] * current / 3
    up, down = [next(v for v in s['halfLoadStepExample'] if v['direction'] == d) for d in ['up', 'down']]
    rails.append(dict(rail=name, currentA=current, conductorDropMV=drop, conductor8mVPass=drop<=8,
                      minimumStaticPinV=r['regulatorMinimumV']-drop/1000,
                      minimumStaticMarginAfterRippleMV=s['minimumRemainingStaticAfterRippleMV'],
                      assumedHalfLoadStepMinimumV=up['lowToleranceMinimumV'],
                      assumedHalfLoadReleaseMaximumV=down['highToleranceMaximumV'],
                      assumedStepLowerMarginAfterRippleMV=up['lowCornerMarginWithRippleMV'],
                      assumedStepUpperMarginAfterRippleMV=down['highCornerMarginWithRippleMV'],
                      upperPeakInductorCurrentA=s['peakInductorCurrentUpperA']))
slots = []
for r in slot['channels']:
    floor = 11.04 if r['rail'] == '12V' else 3.003
    for source in ([11.2,11.4,12] if r['rail']=='12V' else [3.135,3.3]):
        voltage = source-(r['conductorUpperDropMV']+r['mosfetDrop25CMaxRdsMV'])/1000
        slots.append(dict(rail=r['rail'], currentA=r['currentA'], sourceV=source,
                          slotV=voltage, minimumV=floor, marginMV=(voltage-floor)*1000))

power = sum(r['nominalVoltageV']*r['designCurrentA'] for r in loads['rails'].values())
thermal = dict(bridgeRailPowerAllowanceW=power, referenceAmbientC=35,
               maximumTemperatureC=90, requiredThetaJAAtAllowanceCPerW=(90-35)/power,
               referenceStillAirThetaJA=17.38, referenceOneMPerSThetaJA=8.24,
               limitation='All rail input is treated as local heat. ASMedia reference heatsink values do not predict Flamingo temperatures.')
summary = dict(sourceFile=str((OUT/'board.circuit.json').relative_to(ROOT)), sourceSha256=sha,
               loads=loads, tests=tests, execution=execution, typecheckPassed=execution['typecheckExitCode']==0, rails=rails,
               nativeChecks=read('native-commands.json'), physicalChecks=read('physical-commands.json'),
               placementAssessment=read('native-placement-assessment.json'),
               threeV3=dict(passed=three['passed'], cases=len(three['cases']),
                            minimumVCCHV=min(r['vcchMinimumVAt3p135VInput'] for r in three['cases']),
                            minimumVCCA33V=min(r['vcca33MinimumVAt3p135VInput'] for r in three['cases'])),
               reset=dict(normalStartup=reset['normalStartupEnvelope'],
                          powerGoodFallingThresholdPercent=[88.5,96],
                          powerGoodSource='datasheets/TPS62903RPJR.pdf section 6.5, printed page 5',
                          powerGoodLimitation='PG can remain high below the PDX minimum rail voltage. Dedicated threshold monitoring is needed for strict rail-valid reset.',
                          faultFindings=[dict(name=r['name'], failed=r['failed']) for r in reset['results'] if r['failed']]),
               slots=slots, slotStartup=startup['checks'], thermalAllowance=thermal,
               numericalChecks=dict(passive=dynamic['numericChecks'], independentSpice=spice,
                                    threeV3=three['numericChecks'], slotModel=slot_model),
               limitations=dynamic['limitations']+three['limitations']+startup['limitations'])
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')

def table(headers, rows):
    e = lambda v: html.escape(str(v))
    return '<table><thead><tr>'+''.join('<th>'+e(x)+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+e(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'

rail_table = table(['Rail / accepted load','Copper loss at 80°C','Low DC voltage','Static margin after ripple','Assumed 50% step / release'],
                   [[f"{r['rail']} / {r['currentA']:g} A",f"{r['conductorDropMV']:.2f} mV",f"{r['minimumStaticPinV']:.4f} V",
                     f"{r['minimumStaticMarginAfterRippleMV']:.2f} mV",f"{r['assumedHalfLoadStepMinimumV']:.4f} / {r['assumedHalfLoadReleaseMaximumV']:.4f} V"] for r in rails])
sensitivity = table(['Hypothetical VDD change','Minimum incl. ripple','Maximum incl. ripple','Conditional window'],
                    [[r['variant']['name'],f"{r['minimumIncludingSelectedRippleV']:.4f} V",f"{r['maximumIncludingSelectedRippleV']:.4f} V",
                      'Inside' if r['conditionalVoltageWindowPass'] else 'Outside'] for r in sweep['cases'] if r['rail']=='VDD' and r['profile']=='low_ac_sensitivity'])
slot_table = table(['Slot rail / load','Source voltage','Slot voltage','Margin'],
                   [[f"{r['rail']} / {r['currentA']:g} A",f"{r['sourceV']:.3f} V",f"{r['slotV']:.4f} V",f"{r['marginMV']:+.1f} mV"] for r in slots])
vdd = next(r for r in rails if r['rail']=='VDD')
required_reduction = max(0, 1-8/vdd['conductorDropMV'])*100
report = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flamingo power review at the accepted current budgets</title>
<style>body{{margin:0;background:#f5f7fa;color:#183246;font:16px/1.55 system-ui,sans-serif}}main{{max-width:1100px;margin:auto;padding:32px 24px 70px}}h1{{line-height:1.2}}h2{{margin-top:34px}}table{{width:100%;border-collapse:collapse;background:white;font-size:14px}}th,td{{padding:10px;border-bottom:1px solid #d7e0e7;text-align:left}}th{{background:#e6edf3}}.note{{border-left:5px solid #ae5a24;background:#fff0dc;padding:16px 22px;margin:20px 0}}img{{max-width:100%}}code{{overflow-wrap:anywhere;font-size:12px}}a{{color:#006292}}</style>
<main><p>22 October 2026 · Fresh circuit snapshot · Analysis only</p>
<h1>Power review: 1 A VCCL, 3 A VDD, 100 mA combined VCCH/VCCA33</h1>
<div class="note"><strong>VDD margin and reset fault recovery are the clearest improvement targets.</strong>
<p>These are model findings. Unknown chip load steps and the actual regulator control response prevent a hardware pass claim.</p></div>
<p>Regression tests: {tests['pass']} passed, {tests['skip']} skipped, {tests['fail']} failed. TypeScript {'passed' if summary['typecheckPassed'] else 'failed'}. Numerical controls and the independent passive SPICE comparison passed.</p>
<p>The initial full run had two timeouts. Both tests passed on an isolated retry with unchanged assertions and the same circuit artifact. <a href="tests.log">Initial run</a> · <a href="retry.log">Targeted retry</a>.</p>
<p>Native schematic placement, shorts and routing-style checks pass. Native placement reports one orientation heuristic for C_VDD_28, with zero placement DRC errors or warnings. The fixed routed contacts pass the copper checks. <a href="native-placement-assessment.json">Assessment</a>.</p>
<h2>Bridge supplies</h2>{rail_table}
<p>Static corners include regulator reference, resistor tolerance, TCR and feedback leakage. Copper loss includes the existing mesh allowance at 80°C.</p>
<p>The 3 A VDD conductor target requires at least {required_reduction:.1f}% less modeled feed resistance to meet the separate 8 mV project limit.</p>
<p>The transient example assumes a 200 ns edge, a 0.5 µs detection delay and ideal maximum current slew. Link inductance is 5 nH and mounting inductance is 1 nH per capacitor. The capacitor case combines typical bias curves with conservative sensitivity factors.</p>
<p>VDD requires 1.10–1.16 V and VCCL requires 1.85–1.95 V at the package. The example's lower and upper values use separate tolerance corners before switching ripple.</p>
<h2>Changes to investigate</h2>
<ol><li><strong>VDD distribution and response:</strong> reduce feed impedance and review local bypass access. Obtain a usable converter model or measure the actual load response before selecting a final remedy.</li>
<li><strong>Rail-qualified reset:</strong> monitor VDD and VCCL before reset release and during faults. A dedicated supervisor needs suitable thresholds, accuracy and ASMedia timing. Its output must discharge the existing 1 µF reset capacitor within the selected fault-response goal.</li>
<li><strong>Cooling and current margin:</strong> VDD uses the regulator's full 3 A nominal rating. The bridge rail allowance totals {power:.2f} W. Verify converter derating and the bridge thermal path.</li>
<li><strong>Slot startup:</strong> the modeled current-bank peak is {startup['checks']['maximumNewPeakCurrentA']:.2f} A and peak switch dissipation is {startup['checks']['maximumNewPeakPowerW']:.2f} W. Review the full VDS/current trajectory against temperature-adjusted SOA. Controlled inrush is an option if that review finds insufficient margin.</li>
<li><strong>Slot source and losses:</strong> reduce series loss where practical and verify the intended PSU and cable. Low-input and hot-MOSFET conditions require additional margin.</li></ol>
<h2>VDD parameter sensitivities</h2>{sensitivity}
<p>These are hypothetical parameter targets, not implemented layout changes. No extra capacitance is added. A higher feedback setpoint trades lower-voltage margin for upper-voltage margin.</p>
<p>Changing interconnect resistance or inductance also changes damping. The table compares both load increase and release.</p>
<h2>3.3 V bridge supply</h2>
<p>The six split/load cases {'pass' if three['passed'] else 'do not all pass'} the 3.0 V project floor. Minimum VCCH is {summary['threeV3']['minimumVCCHV']:.4f} V and VCCA33 is {summary['threeV3']['minimumVCCA33V']:.4f} V from ideal 3.135 V ATX pads.</p>
<p>The cases include the combined 100 mA bridge allowance, separate support loads and 0 A or 3 A slot loading. The analog share remains unknown. Analog noise, inrush and ground loss remain outside this screen.</p>
<h2>Reset and startup</h2>
<p>All {reset['normalStartupEnvelope']['cases']} normal-startup sensitivity cases pass, with {reset['normalStartupEnvelope']['minimumMarginMs']:.1f} ms minimum modeled reset margin.</p>
<p>Missing VDD, VDD brownout and a short power cycle expose the RC reset's limits. The reset experiments prescribe rail waveforms; they do not simulate loaded buck startup.</p>
<p>The TPS62903 PG falling threshold spans 88.5–96% of nominal. For VDD, that is approximately 1.00–1.09 V, below the chip's 1.10 V minimum. PG alone cannot enforce the specified voltage window. <a href="https://www.ti.com/lit/ds/symlink/tps62903.pdf#page=5">TI threshold specification</a>.</p>
<p>The 3.3 V slot startup sweep contains {startup['checks']['cases']} cases. Current-bank cases {'all reach' if startup['checks']['allSettledAbove90PercentAt30ms'] else 'do not all reach'} 90% by 30 ms. Typical-model checks and timestep convergence {'pass' if slot_model['passed'] else 'fail'}. This does not establish switch SOA or fault survival.</p>
<h2>Slot voltage sensitivity</h2>{slot_table}
<p>The table includes 80°C copper and 25°C maximum fully-on MOSFET resistance. It omits cable, connector, ground and hot-resistance increases. Rail stress loads remain separate from the 75 W combined card budget.</p>
<h2>Thermal allowance</h2>
<p>If the {power:.2f} W bridge rail allowance becomes local heat, a 35°C ambient requires less than {thermal['requiredThetaJAAtAllowanceCPerW']:.2f}°C/W to remain below 90°C before extra margin.</p>
<p>ASMedia's reference heatsink data gives 17.38°C/W in still air and 8.24°C/W at 1 m/s. These figures do not describe the assembled Flamingo board.</p>
<h2>Conditional waveforms</h2><img src="dynamics/first-response.png" alt="Conditional first-response waveforms at the accepted currents"><img src="dynamics/delay-sensitivity.png" alt="Sensitivity to the assumed current-response delay">
<h2>Evidence</h2><p>Board SHA-256: <code>{sha}</code></p>
<p><a href="summary.json">Summary and limitations</a> · <a href="dynamics/improvement-sweep.json">All parameter sensitivities</a> · <a href="dynamics/results.json">Passive model cases</a> · <a href="dynamics/spice-check.json">Independent numerical comparison</a> · <a href="validation.json">Board checks</a> · <a href="tests.log">Regression log</a> · <a href="3v3-dc.json">3.3 V cases</a> · <a href="reset.json">Reset scenarios</a> · <a href="slot-startup.json">Slot startup</a></p>
<p>Encrypted vendor control models were not simulated. Ground return and package drops, complete stability, loaded startup, thermal behavior and hardware measurements remain open.</p>
</main></html>'''
(OUT/'report.html').write_text(report)
manifest = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
            for p in OUT.rglob('*') if p.is_file() and p.name!='evidence-sha256.json'}
(OUT/'evidence-sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(report=str(OUT/'report.html'),summary=summary['rails'],tests=tests,sourceSha256=sha),indent=2))
