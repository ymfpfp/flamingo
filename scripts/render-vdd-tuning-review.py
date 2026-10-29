"""Render the source-bound VDD tuning attempt and its unchanged-board checks."""
from pathlib import Path
import csv, hashlib, html, json, re, shutil

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/vdd-tuning-2026-10-27'
raw=json.loads((OUT/'screen/tuning-results.json').read_text())
validation=json.loads((OUT/'validation.json').read_text())
sha=hashlib.sha256((OUT/'checked.circuit.json').read_bytes()).hexdigest()
assert validation['sourceSha256']==raw['sourceSha256']==sha
assert validation['passed']
tests=(OUT/'logs/tests.log').read_text()
assert re.search(r'\b175 pass\b',tests) and re.search(r'\b0 fail\b',tests)
spice=json.loads((OUT/'power-rerun/spice-check.json').read_text())
power=json.loads((OUT/'power-rerun/results.json').read_text())
assert power['sourceSha256']==sha and spice['passed']
assert all(x['passed'] for x in power['numericChecks']+raw['numericChecks'])
source_hashes=json.loads((OUT/'before/source-sha256.json').read_text())
changed=[p for p,h in source_hashes.items() if hashlib.sha256((ROOT/p).read_bytes()).hexdigest()!=h]
assert not changed,changed
best=raw['bestAdmissibleTarget'];base=raw['baseline'];candidate=raw['bestAdmissibleExpandedScreen']
admissible=[x for x in raw['bankCandidates'] if x['dampingCriterionPass'] and x['startupCurrentLimitScreenPass']]
screen_pass=[x for x in admissible if x['marginMVBeforeRipple']>=0]
voltage_only_pass=[x for x in raw['bankCandidates'] if x['marginMVBeforeRipple']>=0]
assert not screen_pass,'A candidate now passes; inspect and revise the decision before rendering'
reset=json.loads((OUT/'reset-report.json').read_text())
assert reset['sourceSha256']==sha
summary={
 'dateLocal':'2026-10-27','status':'Tuning tried; VDD repair remains unverified',
 'completedAttempt':True,'verifiedVddFix':False,'hardwareChanged':False,
 'sourceFile':'dist/vdd-tuning-2026-10-27/checked.circuit.json','sourceSha256':sha,
 'regulator':'TPS62903RPJR','regulatorReplaced':False,'closedLoopValidated':False,
 'stackup':'JLC06161H-3313','stackupSha256':hashlib.sha256((ROOT/'manufacturing/stackup/selected.json').read_bytes()).hexdigest(),
 'bankParameterTargets':raw['bankTargetsEvaluated'],'dampingCriterionPassTargets':raw['dampingAdmissibleTargets'],
 'dampingAndStartupScreenPassTargets':raw['dampingAndStartupAdmissibleTargets'],
 'bankTargetsPassingVoltageStress':len(screen_pass),'dividerTargets':raw['dividerTargetsEvaluated'],
 'bankTargetsPassingVoltageOnlyButRejectedForOtherCriteria':len(voltage_only_pass),
 'feedforwardNetworkValuesIncludingBaseline':raw['feedforwardTargetsEvaluated'],
 'feedforwardTransientSimulationExecuted':False,
 'currentBoardStressRangeBeforeRippleV':[base['lowVBeforeRipple'],base['highVBeforeRipple']],
 'bestPreliminaryBankTarget':best,
 'bestPreliminaryBankStressRangeBeforeRippleV':[candidate['lowVBeforeRipple'],candidate['highVBeforeRipple']],
 'voltageLimitsV':[1.1,1.16],'tests':{'pass':175,'skip':8,'fail':0},
 'fullBoardValidatorPassed':True,'separateVccl3AStressQualified':validation['reports']['pdnLoad']['qualified'],
 'independentPassiveNumericCrosscheckPassed':True,
 'normalStartupEnvelope':reset['normalStartupEnvelope'],
 'hardwareSourceChangesSinceSnapshot':changed,
 'decision':'Retain the existing physical circuit and existing manufacturing files. No candidate was promoted to the board because none passed the unchanged voltage stress and no feed-forward loop response was verified.',
 'openItems':[
  'A measured or supported TPS62903 control-loop/transient response is still required for feed-forward selection.',
  'The actual bridge current-step amplitude/rate and the PCB inductances remain unmeasured.',
  'The current board still has VDD stress-screen failures. This attempt does not prove that the real board fails.',
  'The larger-capacitance candidates were model targets; they were not routed, sourced, purchased, or assembled.',
  'Existing reset, slot restart, thermal, firmware and manufacturer-acceptance issues remain separate.'],
 'resultsFile':'dist/vdd-tuning-2026-10-27/screen/tuning-results.json',
 'reportFile':'dist/vdd-tuning-2026-10-27/report.html',
 'references':raw['references'],
 'scriptSha256':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in
   [ROOT/'simulations/power-dynamics/tune_current_vdd.py',Path(__file__)]}}
(ROOT/'manufacturing/vdd-tuning-review-2026-10-27.json').write_text(json.dumps(summary,indent=2)+'\n')
(OUT/'review.json').write_text(json.dumps(summary,indent=2)+'\n')

def write_csv(file,rows):
    with file.open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
for name,key in [('bank-candidates','bankCandidates'),('divider-candidates','dividerCandidates'),('feedforward-network','feedforwardNetwork')]:
    write_csv(OUT/(name+'.csv'),raw[key])

draft=f'''Subject: TPS62903 VDD load-transient and feed-forward review (Mac-only project)

DRAFT — not sent.

Please review the existing circuit and help select a feed-forward capacitor or
another passive adjustment while retaining TPS62903RPJR.

The current board is {sha}.
Use the source-bound current-circuit PSpice handoff already prepared in
dist/vdd-loadstep-2026-10-27/pspice-current. Its official TI model is unchanged;
we have not executed those encrypted models on the Mac.

Current circuit: input 4.676845 to 5.25 V; 2.5 MHz forced PWM; 1 uH
XGL4020-102MEC; top/bottom feedback 1.87 kOhm / 2.10 kOhm (0.1%, 10 ppm/K);
nominal output 1.134286 V; 75.08 uF nominal direct ceramic capacitance;
two T520B337M2R5ATE009 330 uF reserve branches, each behind 22 milliohm;
47 nF soft-start. Required bridge-pin operating range: 1.10 to 1.16 V.

The passive screen assumes 0 A <-> 3 A in 200 ns, a prescribed regulator
response delay up to 2 us, and distribution inductance up to 20 nH. These
are sensitivity inputs, not measured bridge current or regulator behavior.
No model of the TPS62903 feedback loop is present in that screen.

The new tuning study tried 108 bank targets, eight feedback-divider targets,
and calculated ten Cff networks including the existing 3 pF internal network.
Seventeen bank targets meet the preliminary damping and loaded-startup screens;
none meet the voltage stress screen. Four 330 uF branches behind individual
47 milliohm resistors reduce the screened high corner from about 1.209 V to
1.195 V, but remain outside the range and have not been applied to the PCB.

Please advise:
1. Can TI run the current TPS62903 model or provide a Mac-compatible model?
2. Is the present direct/distributed capacitor network appropriate for DCS-Control?
3. What is the baseline loop crossover, and which Cff value should be evaluated?
   With our low-valued divider, 470 pF external gives about 180/340 kHz zero/pole;
   1 nF external gives about 85/160 kHz. These calculations prove no loop margin.
4. Can a retained TPS62903 circuit meet both increasing- and decreasing-load
   limits once reference, resistor, ripple and distribution effects are included?

Please return full voltage/current waveforms, input deck changes and simulator
version. This request concerns review and simulation, not permission to manufacture.
'''
(OUT/'TI-review-request.txt').write_text(draft)

number=lambda v:f'{v:.4f}'
rows=''.join('<tr>'+''.join(f'<td>{html.escape(str(s))}</td>' for s in r)+'</tr>' for r in [
 ('Required range','1.1000 V','1.1600 V'),
 ('Existing 2 × 330 µF / 22 mΩ',number(base['lowVBeforeRipple'])+' V',number(base['highVBeforeRipple'])+' V'),
 ('Hypothetical 4 × 330 µF / 47 mΩ',number(candidate['lowVBeforeRipple'])+' V',number(candidate['highVBeforeRipple'])+' V')])
ffrows=''.join(f'<tr><td>{x["externalCapacitancePF"]} pF</td><td>{x["zeroHz"]/1000:.1f} kHz</td><td>{x["poleHz"]/1000:.1f} kHz</td><td>Unverified</td></tr>'
 for x in raw['feedforwardNetwork'] if x['externalCapacitancePF'] in [0,220,470,680,1000,2200])
refs=' · '.join(f'<a href="{html.escape(r["url"])}">{html.escape(r["title"])}</a>' for r in raw['references'])
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flamingo VDD tuning attempt</title><style>body{font:17px/1.55 system-ui;max-width:1000px;margin:40px auto;padding:0 24px;background:#f5f7fa;color:#192634}h1{font-size:32px}h2{margin-top:32px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px 12px;border:1px solid #cbd4df;text-align:left;vertical-align:top}.status{background:#fff3dc;border-left:5px solid #b87916;padding:16px 22px}a{color:#07579e}img{width:100%;height:auto}code{font-size:13px;overflow-wrap:anywhere}.small{font-size:14px}</style><h1>VDD tuning: no verified repair yet</h1><p>27 October 2026 · TPS62903 retained · cheaper JLC06161H-3313 stackup</p><div class="status"><b>I tried tuning the existing regulator and capacitor network. No candidate cleared the voltage, damping and startup screens together.</b><p>The physical board is unchanged. The earlier manufacturing package still matches this board. VDD is not marked fixed.</p></div><h2>What was tried</h2><ul><li>108 reserve-bank targets: two, four or six branches; 330–1000 µF per branch; 0–68 mΩ series resistance per branch.</li><li>32 targets meet the preliminary damping criterion. Seventeen also meet the existing loaded-startup current screen. These checks do not establish control-loop stability.</li><li>Sixteen targets pass the voltage screen alone, but fail the damping criterion; some also fail loaded startup. They were rejected. The study does not credit a capacitor ESR minimum that its datasheet does not guarantee.</li><li>Eight voltage-setting resistor targets. Lower settings reduce the peak but worsen the low-voltage dip.</li><li>Nine external feed-forward capacitor values plus the existing circuit. Their feedback-network poles and zeros were calculated. No closed-loop transient simulation was possible.</li></ul><h2>Conditional stress results</h2><p><b>These numbers are not measured voltages or a prediction of chip behavior.</b> The stress assumes a full 3 A load change in 200 ns, a prescribed response delay up to 2 µs and an estimated link inductance up to 20 nH. Both voltage tolerance corners and both load directions are retained. Switching ripple would use more margin and is excluded from this table.</p><table><tr><th>Case</th><th>Lowest voltage</th><th>Highest voltage</th></tr>'''+rows+'''</table><p>The four-branch target improves the passive result but still fails. Its physical parts, space, routing and price have not been verified. It was not applied.</p><img src="screen/load-release-comparison.png" alt="Current and hypothetical tuned VDD load-release stress, both above the required upper voltage"><p class="small">First-response comparison only. Both traces use prescribed currents. The later curve does not establish regulator recovery or settling.</p><h2>Why feed-forward tuning remains open</h2><p>A capacitor across the upper feedback resistor can change how the regulator responds. TI's procedure starts with the original loop crossover or transient response. That information is still missing for the actual Flamingo circuit. Choosing a capacitor from its pole and zero frequencies alone cannot prove stable operation.</p><table><tr><th>External Cff</th><th>Feedback zero</th><th>Feedback pole</th><th>Actual loop result</th></tr>'''+ffrows+'''</table><p>The calculations include the regulator's internal 3 pF capacitor and the existing 1.87 kΩ / 2.10 kΩ divider. No faster response was credited to these unverified values. The circuit already uses forced PWM at 2.5 MHz; that setting is retained.</p><h2>Checks rerun on the current board</h2><ul><li>Fresh build matches the earlier checked board exactly.</li><li>Full board validator passed. Source and netlist: zero errors. Copper shorts and PCB routing style: passed.</li><li>Regression: 175 passed, eight optional/historical skips, zero failures.</li><li>Full passive power sweep rerun, including its retained failures. All numerical controls passed, and an independent ngspice check agrees with the passive equations. This agreement does not validate the regulator model.</li><li>The existing C_VDD_28 orientation heuristic remains the sole reviewed placement advisory. Placement DRC has zero errors and warnings.</li><li>The normal-startup envelope still passes its eighteen prescribed scenarios. The known missing/late-rail and brownout/reset failures remain.</li><li>The separate VCCL 3 A conductor stress case remains outside its target; the planned VCCL 1 A / VDD 3 A copper screens remain as previously checked.</li></ul><h2>What is needed next</h2><p>A supported TPS62903 simulation or a bench measurement of the current regulator circuit is needed to select and verify feed-forward tuning. The actual chip load changes and board inductance also need measurement. The present stress failure does not show that replacing the regulator is necessary.</p><p><a href="TI-review-request.txt">Prepared TI review request</a> — draft only, nothing sent.</p><h2>Evidence and reproducibility</h2><ul><li><a href="review.json">Review summary</a> · <a href="screen/tuning-results.json">Full tuning results</a></li><li><a href="bank-candidates.csv">Bank targets</a> · <a href="divider-candidates.csv">Divider targets</a> · <a href="feedforward-network.csv">Feed-forward networks</a></li><li><a href="validation.json">Board validator</a> · <a href="logs/tests.log">Tests</a> · <a href="logs/placement.log">Placement log</a></li><li><a href="power-rerun/results.json">Power sweep</a> · <a href="power-rerun/spice-check.json">Independent passive solver check</a> · <a href="reset-report.json">Reset results</a></li></ul><p>'''+refs+'''</p><p><code>Board SHA-256: '''+sha+'''</code></p></html>'''
(OUT/'report.html').write_text(page)
for ref in re.findall(r'(?:href|src)="([^"#]+)"',page):
    if not ref.startswith('https://'):assert (OUT/ref).is_file(),ref
print(json.dumps({k:summary[k] for k in ['status','hardwareChanged','sourceSha256','bankParameterTargets','dampingAndStartupScreenPassTargets','bankTargetsPassingVoltageStress','tests']},indent=2))
