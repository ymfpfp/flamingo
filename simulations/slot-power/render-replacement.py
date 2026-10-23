"""Assess the retained candidate simulations; do not modify the board."""
import hashlib, html, json, math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
MAIN=ROOT/'dist/slot-mosfet-focused-2026-10-22'
SOURCE=ROOT/'dist/slot-mosfet-source-study-2026-10-22'
OUT=ROOT/'dist/slot-mosfet-selection-2026-10-22'
OUT.mkdir(parents=True,exist_ok=True)
load=lambda p:json.loads(Path(p).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
base=load(MAIN/'results.json'); source=load(SOURCE/'results.json')
soa=load(ROOT/'simulations/slot-power/si4497-soa.json')
curves=sorted((float(k),v) for k,v in soa['constantPowerCurvesW'].items())

def power_limit(seconds):
    if seconds<=curves[0][0]:return curves[0][1]
    if seconds>10:return curves[-1][1]
    for (a,x),(b,y) in zip(curves,curves[1:]):
        if seconds<=b:return x*(y/x)**(math.log(seconds/a)/math.log(b/a))
    raise ValueError(seconds)

rows=[]
for study,data in [('focused',base),('blocking-source',source)]:
    for raw in data['rows']:
        q={k:v for k,v in raw.items() if k!='events'}
        q['study']=study; q['events']={}
        derate=.9*(150-q['temp'])/125
        for name,raw_event in raw['events'].items():
            e={k:v for k,v in raw_event.items() if k!='points'}
            p=e['linearPeakPowerW']
            eq_time=e['energyJ']/p if p else 0
            e['equivalentForwardWidthMs']=1000*eq_time
            e['equivalentThermalRatio']=p/power_limit(eq_time)/derate if p else 0
            e['fullDurationThermalRatio']=p/power_limit(e['linearDurationMs']/1000)/derate if p else 0
            e['forwardPulseCurrentRatio']=e['peakCurrentA']/70
            e['reversePulseCurrentRatio']=e['reversePeakA']/70
            e['screen']='outside-estimate' if e['equivalentThermalRatio']>1 else 'inside-full-duration-estimate' if e['fullDurationThermalRatio']<=1 else 'equivalent-only-margin'
            q['events'][name]=e
        rows.append(q)

summary=[]
for config in ['dropin','rc5k','rc10k']:
    for temp in [25,85,125]:
        for cap in [1000,2000]:
            rr=[q for q in rows if q['study']=='focused' and q['config']==config and q['temp']==temp and q['kind']=='control' and q['cardUF']==cap]
            entries=[(e['equivalentThermalRatio'],q['index'],name,e) for q in rr for name,e in q['events'].items()]
            if not entries:continue
            eq=max(entries,key=lambda t:t[0]);bound=max(entries,key=lambda t:t[3]['fullDurationThermalRatio'])
            summary.append(dict(config=config,tempC=temp,cardUF=cap,cases=len(rr),worstEquivalentRatio=eq[0],worstEquivalentCase=eq[1],worstEquivalentEvent=eq[2],worstFullDurationRatio=bound[3]['fullDurationThermalRatio'],peakForwardA=max(e['peakCurrentA'] for _,_,_,e in entries)))

numerics=load(MAIN/'numerics.json')
assert numerics['passed']
assert len(rows)==156
assert max(q['chargeResidual'] for q in rows)<.02
assert all(q['finalOutputV']>.85*q['supply'] for q in rows)
assert base['boardSha256']==sha(ROOT/'dist/board.circuit.json')==source['boardSha256']
assert sha(MAIN/'runner.mjs')==base['runnerSha256']
assert sha(SOURCE/'runner.mjs')==source['runnerSha256']

record={
 'date':'2026-10-22','status':'Candidate identified; MOSFET-only change is not validated for all tested startup and restart conditions',
 'candidate':'Si4497DY-T1-GE3','position':'Q_SLOT_12V','hardwareChangesApplied':False,'hardwareQualified':False,
 'boardSha256':base['boardSha256'],'reportFile':str(OUT.relative_to(ROOT)/'report.html'),
 'cases':156,'finalComparisonCases':138,'additionalBlockingSupplyCases':18,
 'candidateSetup':{'MOSFET':'Si4497DY-T1-GE3','R_SLOT_GATE_12V_ohm':10000,'R_SLOT_OFF_12V_ohm':10000,'C_SLOT_GATE_12V_uF':10,'gateCapacitorConnection':'Source to gate; same as current board','topology':'Existing NX3008NBK gate driver retained','applied':False},
 'footprint':{'compatible':True,'package':'SO-8 / JEDEC MS-012, narrow body','pitchMM':1.27,'pins':{'1-3':'Source','4':'Gate','5-8':'Drain'},'existingPadMM':[.58801,1.7999964],'existingRowCenterMM':5.199888,'manufacturerLeadSpanMM':[5.8,6.2],'manufacturerBodyMM':[5.0,4.0],'method':'Compared existing AO4407A land coordinates and courtyard with Si4497DY package drawing and recommended pads, datasheet pages 7-8. Existing lands are longer than the recommended minimum. Same physical pin numbers and orientation.','assemblyLayer':'top'},
 'findings':[
  'Si4497DY has 3.3 mOhm maximum RDS(on) at -10 V and 4.6 mOhm at -4.5 V, plus a substantially higher published pulsed SOA than AO4407A.',
  'A direct replacement with 510 ohm / 100 kohm / 10 uF does not clear the hot startup screen. Its stronger transfer characteristic increases predicted inrush.',
  'With both gate resistors at 10 kohm, the 25 C and 85 C control-cycle cases with 1000 uF added card capacitance clear the full-duration estimated thermal bound.',
  'The 85 C / 2000 uF sensitivity clears the equivalent-pulse estimate but reaches 1.01 times the full-duration bound. It has no robust margin under that stronger bound.',
  '125 C control-cycle cases still exceed the equivalent-pulse estimate. This is a preheat sensitivity, not a measured board temperature.',
  'Fast 12 V return can occur with retained gate charge. The forced-collapse source model predicts approximately 170 A; a separate source-blocking model still predicts approximately 163 A after a 10 ms interruption and a 100 us return ramp. These exceed the 70 A pulsed rating.',
  'In the blocking-source sensitivity, 1 ms return ramps reduce the 1/10 ms interruption surges to approximately 26 A, and 10 ms ramps reduce them to approximately 7.7 A. Actual PSU return behavior must be measured.',
  'Gate-to-drain-only capacitance caused unwanted startup during input application. Dual-capacitor and resistor sweeps did not close the 125 C margin; they are not proposed for the board.',
  'The 3.3 V switch is outside this replacement study. Its previously reported slow hot turn-off remains open.'
 ],
 'decision':'Retain Si4497DY-T1-GE3 as the preferred same-footprint candidate. Do not mark a MOSFET-only swap as a completed hot-restart fix. A release that must cover all tested conditions needs gate reset / controlled restart or an explicitly narrower validated operating envelope.',
 'limitations':[
  'Vendor typical electrical SPICE model, not a process-corner model. Fixed-temperature simulations omit electrothermal feedback and repeated-cycle heat accumulation.',
  'TA=25 C SOA power legs are extended by (150-initialTemperatureC)/125 and a 0.9 curve-reading reserve. This is an engineering estimate. Actual board thermal impedance is unmeasured.',
  'Equivalent pulse uses positive forward-linear energy divided by forward-linear peak power. The separate full-duration bound uses that peak throughout the entire forward-linear event. Ratios above one are outside the estimate, not proof of physical failure.',
  'No additional pulse credit below 1 ms. Forward and reverse current above 70 A are flagged separately from thermal SOA; ohmic surges are not declared linear-mode failures.',
  'The main source model can sink current: 25 mOhm, 200 nH, 100 us ramps. It is a stiff collapse sensitivity, not a measured ATX waveform. Reverse body-diode survival is unqualified.',
  'The additional source model adds a conventional blocking diode. Its forward drop changes the delivered voltage. It checks sensitivity to a supply that cannot absorb reverse current; it is not an ATX PSU model.',
  'Capacitance assumptions: board bulk 470 uF x 1.44, card 1000 uF with 2000 uF sensitivity, effective gate capacitance 5-11 uF. Resistor tolerances and complete device process corners are not qualified.',
  '12 V stress load is 5.5 A nominal, tested as a resistor or a UVLO-ramped current sink. Independent rail stress does not permit more than 75 W combined slot load.',
  'Hard shorts, live insertion, PSU current limiting, reverse recovery limits, and auxiliary card power are outside this review.'
 ],
 'numericalControls':{'all156CasesCompleted':True,'allFinalVoltagesSettled':True,'maximumChargeResidual':max(q['chargeResidual'] for q in rows),'timeStepChecks':numerics,'boardUnchanged':True},
 'model':{'path':base['modelPath'],'sha256':base['modelSha256'],'sourceUrl':'https://www.vishay.com/docs/66616/si4497dy.zip','adaptations':base['modelAdaptations']},
 'evidence':{'focusedResults':str((MAIN/'results.json').relative_to(ROOT)),'focusedRunnerSnapshot':str((MAIN/'runner.mjs').relative_to(ROOT)),'sourceResults':str((SOURCE/'results.json').relative_to(ROOT)),'sourceRunnerSnapshot':str((SOURCE/'runner.mjs').relative_to(ROOT)),'runner':'simulations/slot-power/check-replacement.mjs','soa':'simulations/slot-power/si4497-soa.json'},
 'summary':summary,'rows':rows,
}
(OUT/'assessed-results.json').write_text(json.dumps(record,indent=2)+'\n')
permanent={k:v for k,v in record.items() if k!='rows'}
(ROOT/'manufacturing/slot-power-routing/mosfet-replacement-review-2026-10-22.json').write_text(json.dumps(permanent,indent=2)+'\n')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(3,1,figsize=(9,7),sharex=True,layout='constrained')
for index,label in [(4,'Same MOSFET, original gate values'),(96,'Si4497DY, both resistors 10 kohm')]:
    w=load(MAIN/f'wave-{index:03}.json')
    for ax,name,unit in zip(axes,['outputV','currentA','powerW'],['Output (V)','Current (A)','MOSFET power (W)']):
        ax.plot(w['timeMs'],w[name],label=label,linewidth=1.5);ax.set_ylabel(unit);ax.grid(alpha=.2)
axes[0].legend(fontsize=9);axes[-1].set(xlim=(0,40),xlabel='Time (ms)')
fig.suptitle('85 C preheat, 1000 uF card, 5 uF effective gate capacitor, 12.6 V supply')
fig.savefig(OUT/'startup.png',dpi=150);plt.close(fig)
fig,ax=plt.subplots(figsize=(9,3.5),layout='constrained')
for index,label in [(1,'100 us return'),(4,'1 ms return'),(7,'10 ms return')]:
    w=load(SOURCE/f'wave-{index:03}.json');ax.plot([t-160 for t in w['timeMs']],w['currentA'],label=label)
ax.axhline(70,color='#b34332',ls='--',label='70 A pulsed rating')
ax.set(xlim=(-.1,12),ylim=(-2,175),xlabel='Time after supply returns (ms)',ylabel='Switch current (A)',title='Blocking supply sensitivity: 85 C, 10 ms interruption')
ax.grid(alpha=.2);ax.legend(fontsize=9);fig.savefig(OUT/'source-return.png',dpi=150);plt.close(fig)

table=''.join(f'<tr><td>{s["config"]}</td><td>{s["tempC"]} C</td><td>{s["cardUF"]} uF</td><td>{s["worstEquivalentRatio"]:.2f}</td><td>{s["worstFullDurationRatio"]:.2f}</td><td>{s["peakForwardA"]:.1f} A</td></tr>' for s in summary)
findings=''.join(f'<li>{html.escape(t)}</li>' for t in record['findings'])
limits=''.join(f'<li>{html.escape(t)}</li>' for t in record['limitations'])
body=f'''<!doctype html><html><head><meta charset="utf-8"><title>12 V slot MOSFET selection</title><style>
body{{font:16px/1.5 system-ui,sans-serif;color:#20303a;background:#f6f8f9;margin:0}}main{{max-width:1050px;margin:auto;padding:35px 24px}}h1{{font-size:30px}}h2{{margin-top:36px}}.card{{background:white;border:1px solid #d5dfe4;border-radius:10px;padding:20px;margin:20px 0}}.decision{{border-left:6px solid #b86127}}img{{max-width:100%;display:block}}table{{border-collapse:collapse;width:100%;font-size:14px}}td,th{{text-align:left;padding:9px;border-bottom:1px solid #d5dfe4}}li{{margin:8px 0}}a{{color:#03669a}}code{{font-size:14px}}
</style></head><body><main><p>Rev 1 engineering review · 22 October 2026 · Simulation, not hardware qualification</p><h1>Si4497DY fits the existing footprint. A MOSFET-only swap does not close every restart case.</h1>
<div class="card decision"><b>Preferred candidate: Vishay Si4497DY-T1-GE3.</b><p>Keep the SO-8 footprint. The tested gate-value proposal uses 10 kohm for both gate resistors and retains the source-to-gate 10 uF capacitor. The board and BOM remain unchanged because 125 C preheat and fast supply-return cases still require a design decision.</p></div>
<h2>Part and footprint</h2><p>The device has the same 1-3 source, 4 gate, 5-8 drain pinout as AO4407A. Existing pads cover the published lead envelope. All assembly stays on top. Maximum on-resistance is 3.3 milliohm at -10 V, compared with 13 milliohm for AO4407A. At -4.5 V, the new device specifies 4.6 milliohm.</p>
<p><a href="https://www.vishay.com/docs/65748/si4497dy.pdf">Vishay datasheet, including SOA and package drawings</a> · <a href="https://www.vishay.com/docs/66615/si4497dy.pdf">Official SPICE model guide</a> · <a href="https://www.vishay.com/docs/66616/si4497dy.zip">Original model archive</a> · <a href="https://www.aosmd.com/sites/default/files/res/datasheets/AO4407A.pdf">AO4407A datasheet</a></p>
<p>AO4447A and Si4459BDY were screened from their datasheets. Si4497DY had the stronger relevant SOA of these SO-8 candidates and an available manufacturer electrical model. DPAK and PowerPAK candidates would change the footprint. Distributor listings were found for Si4497DY; assembly stock is not qualified.</p>
<h2>What the tests found</h2><ul>{findings}</ul><div class="card"><img src="startup.png" alt="Modeled startup voltage, current and MOSFET power"></div><div class="card"><img src="source-return.png" alt="Source-return current sensitivity"></div>
<h2>Control-cycle stress estimates</h2><p>Smaller ratios give more margin. One is the estimated limit. The equivalent pulse is an energy screen. The full-duration column holds peak power for the entire linear event and gives a stronger bound. Both use hot derating and a 10% curve-reading reserve. Current peaks have a separate 70 A pulsed-rating check.</p><p>dropin = 510 ohm gate / 100 kohm pull-up; rc5k = both 5.1 kohm; rc10k = both 10 kohm. Gate capacitance is 5-11 uF effective. Every configuration uses Si4497DY.</p>
<div class="card"><table><thead><tr><th>Gate setup</th><th>Preheat</th><th>Added card C</th><th>Equivalent ratio</th><th>Full-duration ratio</th><th>Peak current</th></tr></thead><tbody>{table}</tbody></table></div>
<h2>Numerical checks</h2><p>156 retained cases reached their requested endpoints and settled. Maximum capacitor charge-balance residual: {record['numericalControls']['maximumChargeResidual']*100:.3f}%. Five finer-time-step checks compared peak power and peak current; all passed within 3%. The board hash matches the input to both studies. Exact decks, results and runner snapshots are retained in the evidence folders.</p>
<h2>Limits and remaining work</h2><ul>{limits}</ul><p><b>Next design target:</b> ensure that a brief 12 V loss resets the gate before power returns, and provide controlled startup that clears the selected hot operating envelope. The preferred MOSFET can keep its footprint while that control circuit is developed.</p>
<p><a href="assessed-results.json">All assessed results and assumptions</a></p></main></body></html>'''
(OUT/'report.html').write_text(body)
evidence={str(p.relative_to(ROOT)):sha(p) for p in [ROOT/base['modelPath'],ROOT/'datasheets/research/slot-mosfet-startup-2026-10-22/Si4497DY.pdf',ROOT/'datasheets/research/slot-mosfet-startup-2026-10-22/source-manifest.json',ROOT/'simulations/slot-power/si4497-soa.json',MAIN/'runner.mjs',MAIN/'results.json',MAIN/'numerics.json',SOURCE/'runner.mjs',SOURCE/'results.json',ROOT/'simulations/slot-power/check-replacement.mjs',ROOT/'simulations/slot-power/check-replacement-numerics.mjs',Path(__file__),OUT/'assessed-results.json',OUT/'startup.png',OUT/'source-return.png',OUT/'report.html']}
(OUT/'evidence-sha256.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'maxChargeResidual':record['numericalControls']['maximumChargeResidual'],'report':str(OUT/'report.html'),'hardwareChangesApplied':False},indent=2))
