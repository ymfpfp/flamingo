"""Render the existing-switch SOA review. No circuit modification occurs here."""
from pathlib import Path
import hashlib
import html
import json
import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'dist/slot-startup-soa-2026-10-22')
r = json.loads((OUT / 'results.json').read_text())
waves = json.loads((OUT / 'selected-waveforms.json').read_text())
inputs = json.loads((ROOT / r['soaInputsFile']).read_text())
assert hashlib.sha256((ROOT / r['sourceFile']).read_bytes()).hexdigest() == r['sourceSha256']
rows = r['results']

def ohmic_boundary(rail, e):
    # The sloping Rds edge is an on-resistance constraint, not an independent
    # thermal failure limit. Do not label an ohmic pulse as an SOA failure.
    if rail != '3V3' or not e.get('largestVdsV'):
        return False
    p=inputs['parts']['DMP2008UFG']
    pairs=sorted((float(t),v) for t,v in p['constantPowerCurvesW'].items())
    t=e['equivalentWidthMs']/1000
    power=pairs[-1][1] if t>10 else float(np.exp(np.interp(np.log(max(t,pairs[0][0])),
        np.log([q[0] for q in pairs]),np.log([q[1] for q in pairs]))))
    v=e['largestVdsV']
    return v/p['rdsBoundaryOhm'] < min(power/v,p['pulseCurrentCeilingA'])

for q in rows:
    for e in q['events'].values():
        e['ohmicBoundary']=ohmic_boundary(q['rail'],e)
        if e['ohmicBoundary']:e['estimatedScreenStatus']='inconclusive-ohmic-boundary'
r['rawResultsSha256']=hashlib.sha256((OUT/'results.json').read_bytes()).hexdigest()
r['interpretationNote']='The postprocessor identifies the Rds boundary separately. It does not treat that boundary as a thermal failure limit.'
for s in r['summary']:
    qs=[q for q in rows if q['rail']==s['rail']]
    s['outsideEquivalentScreen']=sum(any(e['equivalentRatio']>1 and not e['ohmicBoundary'] for e in q['events'].values()) for q in qs)
    s['inconclusiveOhmicCases']=sum(any(e['ohmicBoundary'] for e in q['events'].values()) for q in qs)
(OUT/'assessed-results.json').write_text(json.dumps(r,indent=2)+'\n')

def number(v):
    return f'{v:.2f}'

def worst(rail, kind, event, temp=None):
    a = [q for q in rows if q['rail'] == rail and q['kind'] == kind and event in q['events']
         and (temp is None or q['temp'] == temp)]
    q = max(a, key=lambda q:q['events'][event]['equivalentRatio'])
    return q, q['events'][event]

plt.rcParams.update({'font.size':10, 'axes.spines.top':False, 'axes.spines.right':False})
fig, axes = plt.subplots(1, 2, figsize=(13, 5), layout='constrained')
labels = ['Startup 25°C', 'Startup 85°C', 'Startup 125°C', 'Disable 85°C',
          'Disable 125°C', 'Re-enable', 'Source reapply']
for ax, rail in zip(axes, ['3V3','12V']):
    es = [worst(rail,'cold','startup',t)[1] for t in [25,85,125]]
    es += [worst(rail,'control-restart','shutdown',t)[1] for t in [85,125]]
    es += [worst(rail,'control-restart','restart')[1],worst(rail,'source-restart','restart')[1]]
    vals = [q['equivalentRatio'] for q in es]
    ax.barh(labels, vals, color=['#8d97a4' if e['ohmicBoundary'] else '#bd422c' if v > 1 else '#337a72' for e,v in zip(es,vals)])
    ax.axvline(1, color='#353b45', linestyle='--', label='Estimated screen limit')
    ax.set(xscale='log',xlim=(.02,max(vals)*2.5),title=f'{rail}: stress / estimated SOA',xlabel='Ratio (more than 1 needs review)')
    ax.invert_yaxis()
    for i,v in enumerate(vals):
        gray=es[i]['ohmicBoundary']
        ax.text(v*.8 if gray else v*1.1, i, 'Rds boundary' if gray else f'{v:.2f}×',
                va='center',ha='right' if gray else 'left',color='white' if gray else '#222',fontsize=9)
fig.suptitle('Existing switches: conditional SOA screen, with a 10% curve-reading reserve', fontsize=13)
fig.savefig(OUT / 'soa-summary.png', dpi=160)
plt.close(fig)

fig, axes = plt.subplots(2, 3, figsize=(14, 7), layout='constrained')
for row, rail in enumerate(['3V3','12V']):
    for col, (kind,event) in enumerate([('cold','startup'),('control-restart','shutdown'),('control-restart','restart')]):
        w=next(w for w in waves if w['name']==f'{rail}-{kind}-{event}')
        q=rows[w['index']]
        ev=q['events'][event]
        t=np.asarray(w['timeMs'])
        start,end=ev['eventStartMs'],ev['eventEndMs']
        # Startup is a few milliseconds. Turn-off can take seconds.
        if event=='startup':end=min(end,start+20)
        if event=='restart':end=min(end,start+20)
        keep=(t>=start-.1)&(t<=end)
        ax=axes[row,col]
        ax.plot(t[keep]-start,np.asarray(w['outputV'])[keep],color='#276c9c',label='Slot output (V)')
        ax.plot(t[keep]-start,np.asarray(w['vdsV'])[keep],color='#587047',label='Switch VDS (V)')
        other=ax.twinx()
        other.plot(t[keep]-start,np.asarray(w['currentA'])[keep],color='#c25b31',label='Switch current (A)')
        other.spines['right'].set_visible(True)
        ax.set(title=f'{rail}: {event}, {q["temp"]}°C, card {q["cardUF"]} µF',xlabel='Time after event (ms)',ylabel='V')
        other.set_ylabel('A',color='#c25b31')
        if row==0 and col==0:
            lines=ax.get_lines()+other.get_lines()
            ax.legend(lines,[x.get_label() for x in lines],loc='upper right',fontsize=8)
fig.suptitle('Worst-case waveforms, including 2,000 µF card and uncapped-driver sensitivities',fontsize=13)
fig.savefig(OUT / 'waveforms.png',dpi=150)
plt.close(fig)

table=[]
for rail in ['3V3','12V']:
    for kind,event,name in [('cold','startup','Startup'),('control-restart','shutdown','Disable'),
                            ('control-restart','restart','Re-enable'),('source-restart','restart','Source reapply')]:
        q,e=worst(rail,kind,event)
        table.append({'rail':rail,'event':name,'case':q['index'],'temperatureC':q['temp'],
                      'cardCapacitanceUF':q['cardUF'],'driverModel':q['driver'],
                      'peakCurrentA':e['peakCurrentA'],'peakPowerW':e['peakPowerW'],
                      'energyJ':e['energyJ'],'equivalentWidthMs':e.get('equivalentWidthMs',0),
                      'estimatedStressRatio':e['equivalentRatio'],
                      'interpretation':'inconclusive-ohmic-boundary' if e['ohmicBoundary'] else 'estimated-linear-SOA'})

# Charge balance is independent of the SOA calculation. The retained waveform
# decimation limits this check to a 2% residual for the two selected cold cases.
charge=[]
for rail in ['3V3','12V']:
    w=next(w for w in waves if w['name']==f'{rail}-cold-startup')
    q=rows[w['index']]
    c=next(c for c in r['configs'] if c['rail']==rail)
    t=np.asarray(w['timeMs'])/1000
    v=np.asarray(w['outputV'])
    current=np.asarray(w['currentA'])
    load=np.zeros_like(v) if q['load']=='idle' else (v/c['v']*c['amps'] if q['load']=='resistive'
        else c['amps']*np.clip((v-c['uvlo'][0])/(c['uvlo'][1]-c['uvlo'][0]),0,1))
    net=np.trapezoid(current-load-v/c['bleed'],t)
    expected=(sum(c['bulkF'])*1.44+c['ceramicF']+q['cardUF']*1e-6)*(v[-1]-v[0])
    error=abs(net-expected)/abs(expected)
    charge.append({'rail':rail,'case':q['index'],'integratedChargeC':net,'capacitorChargeC':expected,
                   'relativeResidual':error,'passed':bool(error<.02)})
assert all(c['passed'] for c in charge),charge
controls={'selectedColdChargeBalance':charge,'sourceHashMatches':True,
          'all268CasesPresent':len(rows)==268,'allWaveformsReachedRequestedEnd':True,
          'allCaseChargeBalancePassed':all(q['chargeBalance']['relativeResidual']<.02 for q in rows),
          'maximumCaseChargeResidual':max(q['chargeBalance']['relativeResidual'] for q in rows),
          'timeStepChecks':json.loads((OUT/'timestep-checks.json').read_text()),
          'independentRampControls':json.loads((OUT/'independent-ramp-envelope.json').read_text())['controls'],
          'ohmicBoundaryInterpretationPass':ohmic_boundary('3V3',rows[115]['events']['restart']) and not ohmic_boundary('3V3',rows[110]['events']['shutdown']),
          'solverRetries':sum(q['solverAttempt']>0 for q in rows)}
assert controls['all268CasesPresent']
assert controls['allCaseChargeBalancePassed']
assert controls['timeStepChecks']['passed']
assert controls['ohmicBoundaryInterpretationPass']
(OUT/'numerical-controls.json').write_text(json.dumps(controls,indent=2)+'\n')

record={'date':'2026-10-22','status':'Rev 1 change recommended; circuit unchanged',
        'sourceFile':r['sourceFile'],'sourceSha256':r['sourceSha256'],
        'reportFile':str((OUT/'report.html').relative_to(ROOT)),
        'resultsFile':str((OUT/'assessed-results.json').relative_to(ROOT)),
        'rawElectricalResultsFile':str((OUT/'results.json').relative_to(ROOT)),
        'runnerFile':'simulations/slot-power/check-startup-soa.mjs',
        'soaInputsFile':r['soaInputsFile'],'cases':len(rows),'worstEvents':table,
        'numericalControls':controls,
        'decision':{'rail12':'Replace or redesign the 12 V switching path for controlled startup and adequate hot SOA. Do not release it as qualified.',
                    'rail3V3':'Startup clears the equivalent-pulse estimate. Some conservative full-duration bounds are inconclusive. Hot control cycling needs faster turn-off or an operating restriction.',
                    'automaticRestart':'Do not assume a brief HDDPC disable fully removes slot power. The nominal gate-off time constant is 1 second.',
                    'hardwareChangesApplied':False},
        'limitations':r['limitations'],'hardwareQualified':False}
permanent=ROOT/'manufacturing/slot-power-routing/startup-soa-review-2026-10-22.json'
permanent.write_text(json.dumps(record,indent=2)+'\n')

tr=''.join('<tr>'+''.join(f'<td>{html.escape(str(v))}</td>' for v in [x['rail'],x['event'],x['temperatureC'],
              number(x['peakCurrentA']),number(x['peakPowerW']),number(x['energyJ']*1000),
              number(x['equivalentWidthMs']),'Rds boundary' if x['interpretation']=='inconclusive-ohmic-boundary' else number(x['estimatedStressRatio'])+'×'])+'</tr>' for x in table)
limitations=''.join(f'<li>{html.escape(x)}</li>' for x in r['limitations'])
document=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slot startup and hot-restart SOA — 2026-10-22</title>
<style>body{{font:16px/1.55 system-ui,sans-serif;color:#243140;background:#f4f6f8;margin:0}}main{{max-width:1140px;margin:auto;padding:32px}}h1{{line-height:1.2}}h2{{margin-top:32px}}.card{{background:white;padding:22px;border-radius:12px;margin:18px 0}}.decision{{border-left:5px solid #bd422c}}img{{max-width:100%;height:auto}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{padding:9px;border-bottom:1px solid #dce2e8;text-align:left}}a{{color:#126596}}code{{overflow-wrap:anywhere}}li{{margin:8px 0}}</style>
<main><h1>Slot startup and hot-restart SOA</h1><p>Existing Rev 1 circuit · 2026-10-22 · {len(rows)} electrical simulation cases</p>
<div class="card decision"><strong>Recommendation: change the 12 V switching path before Rev 1 fabrication.</strong>
<p>The approximate AO4407A model exceeds the estimated SOA limits during startup and control cycling. Parameter sensitivity does not establish adequate margin.</p>
<p>The 3.3 V startup cases clear the equivalent-pulse estimate. Some conservative full-duration bounds are inconclusive. Slow turn-off remains a concern during hot control cycling.</p>
<p>The circuit, BOM, placement and routing remain unchanged. This report proposes a design change.</p></div>
<div class="card"><h2>What the circuit does</h2>
<p>The DMP2008UFG switches 3.3 V. The AO4407A switches 12 V. Each gate has a 510 Ω drive resistor, 100 kΩ pull-up and 10 µF capacitor.</p>
<p>The nominal gate-off time constant is 1 second. A brief HDDPC disable does not guarantee that slot power disappears.</p>
<p>The board adds 660 µF on 3.3 V and 470 µF on 12 V. The main screen adds an assumed 1,000 µF card capacitance per rail.</p></div>
<div class="card"><h2>SOA results</h2><img src="soa-summary.png" alt="Stress ratios for both rails">
<p>A ratio greater than 1 exceeds the estimated screen. These ratios are engineering estimates, not measured failure probabilities.</p>
<p>The gray source-reapply result reaches the Rds boundary of the graph. It is inconclusive, rather than evidence of thermal SOA failure.</p>
<table><thead><tr><th>Rail</th><th>Event</th><th>Initial °C</th><th>Peak A</th><th>Peak W</th><th>Energy mJ</th><th>Equivalent ms</th><th>Ratio</th></tr></thead><tbody>{tr}</tbody></table>
<p>The table and chart select each worst event independently, including the 2,000 µF card and uncapped-driver sensitivities.</p>
<p>The 12 V startup peak of 225 W uses the 2,000 µF sensitivity. The 1,000 µF hot-start case also exceeds the estimate.</p>
<p>Peak current and peak power do not necessarily occur together. The assessed JSON records each selected case.</p></div>
<div class="card"><h2>Startup and restart waveforms</h2><img src="waveforms.png" alt="Voltage and current during startup, disable and re-enable">
<p>Hot cases begin at 85°C or 125°C. The simulation retains gate charge and output charge across control cycles.</p>
<p>Separate source cycles use 100 µs supply ramps. The source model can absorb reverse current. The actual ATX source can behave differently.</p></div>
<div class="card"><h2>Required design work</h2><ol>
<li>Use a 12 V switch with adequate hot SOA and a controlled output ramp or current limit.</li>
<li>Use faster turn-off on both rails if HDDPC must remove power during a restart.</li>
<li>Repeat the startup and hot-restart screen for the selected circuit.</li>
<li>Measure switch voltage, current and temperature with the intended card during prototype tests.</li></ol>
<p>A larger gate capacitor alone is not an established fix. A slower ramp reduces charging current but extends dissipation under load.</p>
<p>A lower on-resistance alone is not an SOA qualification. Any replacement needs its own switching and temperature review.</p></div>
<div class="card"><h2>Methods and numerical controls</h2>
<p>The 3.3 V model comes from Diodes. The 12 V model approximates the AO4407A transfer characteristics. It is not a manufacturer model.</p>
<p>The screen integrates VDS × current. It uses the equivalent square duration E/Ppeak, log interpolation and temperature derating.</p>
<p>The screen also calculates a conservative full-duration comparison. Some cases pass only the equivalent-pulse estimate.</p>
<p>The independent linear-ramp calculation covers 0.1–100 ms output ramps. With the assumed 1,000 µF card load, no loaded 12 V ramp clears the hot estimate.</p>
<p>The best 12 V result at 85°C is approximately 1.53 times the estimated limit for the UVLO load. A gate RC change alone lacks demonstrated margin.</p>
<p>The SOA curves refer to manufacturer test boards at 25°C. Hot derating and the actual board mounting remain unqualified.</p>
<p>All {len(rows)} cases pass the charge-balance check within 2% and reach their requested simulation endpoint. Six refined time-step cases agree within 3%.</p>
<p><a href="assessed-results.json">Assessed cases and assumptions</a> · <a href="results.json">Raw electrical results</a> · <a href="numerical-controls.json">Numerical controls</a> · <a href="selected-waveforms.json">Selected waveforms</a> · <a href="independent-ramp-envelope.json">Independent ramps</a></p>
<p>Board SHA-256: <code>{r['sourceSha256']}</code></p></div>
<div class="card"><h2>Limits</h2><ul>{limitations}</ul></div>
<div class="card"><h2>Manufacturer evidence</h2><ul>
<li><a href="https://www.aosmd.com/sites/default/files/res/datasheets/AO4407A.pdf">AO4407A datasheet</a>: Figure 9 and Note E.</li>
<li><a href="https://www.diodes.com/datasheet/download/DMP2008UFG.pdf">DMP2008UFG datasheet</a>: Figure 12.</li>
<li><a href="https://www.ti.com/lit/an/sluaao2/sluaao2.pdf?ts=1678821992521">TI SOA methods</a>: Sections 5–7.</li></ul></div></main></html>'''
(OUT/'report.html').write_text(document)
print(json.dumps({'report':str(OUT/'report.html'),'cases':len(rows),'controls':controls,'worstEvents':table},indent=2))
