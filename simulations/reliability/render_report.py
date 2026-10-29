"""Build a source-bound review from the retained campaign artifacts."""
import hashlib
import html
import json
from pathlib import Path
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'dist/reliability-2026-10-23')
load=lambda p:json.loads((OUT/p).read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
execution=load('execution.json')
board_sha=sha(OUT/'board.circuit.json')
assert execution['sourceSha256']==board_sha
files={'validation':'validation.json','pdn':'pdn-dc.json','slot_dc':'slot-dc.json',
       'atx5':'atx5v-dc.json','margins':'margins.json','schematic':'schematic.json',
       'datasheets':'datasheets.json','reset':'reset.json','driver':'driver.json',
       'cap_start':'slot3v3-startup.json','cap_numeric':'slot3v3-numerics.json',
       'slot12':'slot12v/summary.json','slot12raw':'slot12v/results.json',
       'slot12blocking':'slot12v-blocking/results.json','slot3':'slot3v3/results.json',
       'passive':'passive/report.json','three':'3v3-dc.json','power':'power/results.json','options':'power/improvement-sweep.json',
       'power_numeric':'power/spice-check.json','pcie':'pcie-si.json','usb':'usb-si.json','channel':'channel.json'}
data={k:load(v) for k,v in files.items()}
for key,d in data.items():
    digest=d.get('sourceSha256',d.get('source_sha256',d.get('boardSha256')))
    if digest is not None: assert digest==board_sha, 'Stale board artifact: '+files[key]
for k in ['power','channel']:
    for filename,digest in data[k]['inputSha256'].items():
        assert sha(ROOT/filename)==digest, 'Changed model input: '+filename
assert data['passive']['runnerSha256']==sha(Path(__file__).with_name('passive-corners.mjs'))
assert data['slot3']['runnerSha256']==sha(ROOT/'simulations/slot-power/check-startup-soa.mjs')
assert data['slot12raw']['runnerSha256']==sha(ROOT/'simulations/slot-power/check-replacement.mjs')
assert data['slot12']['resultsSha256']==sha(OUT/'slot12v/results.json')
assert data['power_numeric']['passed'] and data['cap_numeric']['passed']
assert data['slot12']['numericalChecks']['passed'] and data['passive']['numericalChecks']['passed']
assert all(c['passed'] for c in data['power']['numericChecks']+data['channel']['numericChecks']+data['three']['numericChecks'])

power=data['power']; passive=data['passive']; slot3=data['slot3']
rows=[]
for rail in power['summary']:
    up,down=[next(c for c in rail['halfLoadStepExample'] if c['direction']==d) for d in ['up','down']]
    rows.append(dict(rail=rail['rail'],currentA=rail['selectedCurrentA'],staticMarginMV=rail['minimumRemainingStaticAfterRippleMV'],
                     stepMinimumV=up['lowToleranceMinimumV'],releaseMaximumV=down['highToleranceMaximumV'],
                     stepLowerMarginWithRippleMV=up['lowCornerMarginWithRippleMV'],releaseUpperMarginWithRippleMV=down['highCornerMarginWithRippleMV']))
vdd=next(r for r in rows if r['rail']=='VDD')
vdd_step=next(r for r in power['summary'] if r['rail']=='VDD')['halfLoadStepExample'][0]
vccl_dc=next(r for r in data['pdn']['results'] if r['rail']=='VCCL')['screeningUpperDropMV']
blocking=data['slot12blocking']['rows']
blocking_peak=max(e['peakCurrentA'] for q in blocking for e in q['events'].values())
slot12_peak=max(e['peakCurrentA'] for q in data['slot12raw']['rows'] for e in q['events'].values())
slot3_events=[dict(**e,index=q['index'],temp=q['temp'],kind=q['kind'],event=name)
              for q in slot3['results'] for name,e in q['events'].items()]
thermal_power=sum(v['nominalVoltageV']*v['designCurrentA'] for v in power['currentAssumptions']['rails'].values())
thermal=dict(railPowerAllowanceW=thermal_power,requiredThetaJA35C=(90-35)/thermal_power,
             requiredThetaJA50C=(90-50)/thermal_power,referenceStillAirThetaJA=17.38,referenceAirflowThetaJA=8.24,
             limitation='All accepted bridge rail power is treated as local heat. Reference heatsink data do not predict this assembly.')
counts=dict(powerRipple=len(power['rippleCases']),powerTransients=len(power['transientCases']),
            powerEdgeSensitivities=len(power['edgeAndEsrCases']),historicalGuardbandComparisons=len(power['guardbandCases']),
            hypotheticalPowerTargets=len(data['options']['cases']),
            resetBaseline=len(data['reset']['results']),gateDriver=len(data['driver']['results']),
            slot3v3CapacitorComparisons=len(data['cap_start']['results']),slot12v=data['slot12']['cases'],
            slot12vBlockingSource=len(blocking),slot3v3StartupAndRestart=slot3['cases'],
            vbus=passive['summary']['vbusCases'],resetCycles=passive['summary']['resetCases'],
            passiveRefinements=passive['summary']['refinementCases'],
            slot12vRefinements=len(data['slot12']['numericalChecks']['refinement']),channelNetworks=len(data['channel']['cases']))
findings=[
    dict(priority=1,title='VDD transient margin remains open',
         evidence=f'The selected {vdd_step["initialCurrentA"]:g} A to {vdd_step["finalCurrentA"]:g} A step reaches {vdd["stepMinimumV"]:.5f} V at the low regulator corner. The matching release reaches {vdd["releaseMaximumV"]:.5f} V at the high corner, before ripple.',
         action='Measure both load-step directions at the bridge pads. Obtain compatible TPS62903 closed-loop results. Evaluate capacitance, interconnect inductance and regulator response together.'),
    dict(priority=1,title='Power cycling does not guarantee a bridge reset',
         evidence=f"{passive['summary']['resetCasesWithoutGuaranteedLow']} of 96 passive cycle cases never reach the guaranteed 0.8 V reset-low level before power returns.",
         action='Evaluate reset discharge and multi-rail supervision. Capture VCCH, VCCL, VDD and RST# during short interruptions and during USB attach with ATX off.'),
    dict(priority=1,title='Rapid 12 V return exceeds the modeled pulse envelope',
         evidence=f'The forced-collapse model reaches {slot12_peak:.1f} A forward current. The blocking-source model still reaches {blocking_peak:.1f} A. The recorded pulse ceiling is 70 A.',
         action='Evaluate gate reset or controlled restart. Measure the actual PSU return ramp. Keep live card insertion outside the operating envelope until a separate review.'),
    dict(priority=1,title='The 3.3 V switch still has hot shutdown and restart findings',
         evidence=f"{slot3['summary'][0]['outsideEquivalentScreen']} of {slot3['cases']} scenarios exceed the estimated equivalent-pulse SOA screen. All scenarios settle, which does not establish SOA margin.",
         action='Evaluate faster turn-off and restart control. Measure current and VDS during enable cycles and supply return. Check the trajectory at the measured switch temperature.'),
    dict(priority=2,title='Cooling must cover the accepted power allowance',
         evidence=f'The bridge rail budgets sum to {thermal_power:.2f} W. A 35 C ambient requires thetaJA at most {thermal["requiredThetaJA35C"]:.2f} C/W if all this power becomes local heat.',
         action='Use a defined heatsink and airflow fixture for the first board. Measure package temperature under sustained traffic. Reference thermal data alone cannot qualify the board.'),
    dict(priority=2,title='Signal integrity still needs complete channel models',
         evidence='All twelve differential channels have reduced-network sensitivity results. Package, connector, cable/card and receiver models remain incomplete. No valid eye or BER pass exists.',
         action='Obtain wideband connector and package models where available. Measure link training, negotiated speed, error counters and sustained transfers across cables and endpoints.'),
    dict(priority=2,title='VCCL retains the separate 3 A conductor finding',
         evidence=f'The 80 C mesh screen gives a {vccl_dc:.2f} mV upper drop at 3 A against the 8 mV project budget. The accepted planning load is 1 A.',
         action='Retain the 1 A design assumption explicitly. Measure rail current and voltage at the bridge. Revisit copper if the measured current or transient demand exceeds the available margin.'),
]
result=dict(sourceSha256=board_sha,counts=counts,power=rows,thermal=thermal,findings=findings,
            boardValidationPassed=data['validation']['passed'],allModelsHardwareQualified=False,
            fabricationReady=data['validation']['reports']['drc']['fabricationReady'],
            stages=execution['stages'],artifactSha256={p:sha(OUT/p) for p in files.values()})
(OUT/'summary.json').write_text(json.dumps(result,indent=2)+'\n')

plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,2,figsize=(12,4.3),layout='constrained')
for ax,rail in zip(axes,['VCCL','VDD']):
    cases=[c for c in power['transientCases'] if c['rail']==rail and c['profile']=='low_ac_sensitivity'
           and c['linkNH']==5 and c['mountPerCapNH']==1 and c['stepFractionOfSelectedCurrent']==.5]
    for direction,label,color in [('up','Lower-voltage margin','#ad3c39'),('down','Upper-voltage margin','#286a9b')]:
        rr=sorted([c for c in cases if c['direction']==direction],key=lambda c:c['assumedDelayUS'])
        key='lowCornerMarginWithRippleMV' if direction=='up' else 'highCornerMarginWithRippleMV'
        ax.plot([c['assumedDelayUS'] for c in rr],[c[key] for c in rr],'o-',label=label,color=color)
    ax.axhline(0,color='#333',lw=1);ax.set(title=f'{rail}: 50% load step and release',xlabel='Assumed current-response delay (us)',ylabel='Voltage margin including ripple (mV)');ax.grid(alpha=.18);ax.legend(fontsize=8)
fig.suptitle('Conditional passive model: negative margin needs resolution')
fig.savefig(OUT/'power-margins.png',dpi=170);plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(12,4.5),layout='constrained')
off=sorted(set(q['offMs'] for q in passive['reset']))
for factor in [.5,1,1.2]:
    rr=[max(q['resetBeforeRestartV'] for q in passive['reset'] if q['offMs']==ms and q['capFactor']==factor) for ms in off]
    axes[0].semilogx(off,rr,'o-',label=f'{factor:g} x nominal capacitance')
axes[0].axhline(.8,color='#ad3c39',ls='--',label='Guaranteed reset low')
axes[0].set(title='Residual reset voltage before supply return',xlabel='Prescribed zero-volt interval (ms)',ylabel='Worst supply/resistor corner (V)');axes[0].legend(fontsize=8);axes[0].grid(alpha=.18)
for w in load('passive/waveforms.json'):
    axes[1].plot(w['timeMs'],w['resetV'],label=f"{w['offMs']} ms off")
axes[1].axhline(.8,color='#ad3c39',ls='--');axes[1].set(xlim=(-10,450),title='Reset voltage during a power cycle',xlabel='Time from start of supply collapse (ms)',ylabel='Reset voltage (V)');axes[1].legend(fontsize=8);axes[1].grid(alpha=.18)
fig.savefig(OUT/'reset-cycles.png',dpi=170);plt.close(fig)

esc=lambda x:html.escape(str(x))
def table(head,rr):
    return '<table><tr>'+''.join('<th>'+esc(h)+'</th>' for h in head)+'</tr>'+''.join('<tr>'+''.join('<td>'+esc(v)+'</td>' for v in row)+'</tr>' for row in rr)+'</table>'
power_table=table(['Rail / design current','DC + ripple margin','Step minimum','Release maximum'],
                  [[f"{r['rail']} / {r['currentA']:g} A",f"{r['staticMarginMV']:.2f} mV",f"{r['stepMinimumV']:.5f} V",f"{r['releaseMaximumV']:.5f} V"] for r in rows])
slot_table=table(['Temperature / card capacitance','Cases','Equivalent SOA ratio','Full-duration ratio'],
                 [[f"{r['temp']} C / {r['cardUF']} uF",r['cases'],f"{r['worstEquivalent']['equivalentRatio']:.3f}",f"{r['worstFullDuration']['fullDurationRatio']:.3f}"] for r in data['slot12']['summary'] if r['kind']=='control'])
channel_table=table(['Channel','Nyquist frequency','PCB loss sensitivity','Status'],
                    [[r['name'],f"{r['nyquistGHz']} GHz",' to '.join(f'{x:.2f}' for x in r['insertionLossSensitivityAtNyquistDB'])+' dB','Complete channel unqualified'] for r in data['channel']['summary']])
regression=next((s for s in execution['stages'] if s['name']=='regression'),None)
regression_text=(OUT/'logs/regression.log').read_text() if regression else ''
import re
test_counts={key:int(re.search(r'^\s*(\d+) '+key+r'\s*$',regression_text,re.M)[1]) for key in ['pass','skip','fail']}
assert test_counts['fail']==0
numeric_error=data['power_numeric']['minimumDifferenceMV']
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flamingo simulation campaign</title><style>
body{{margin:0;background:#f4f6f8;color:#183044;font:16px/1.55 system-ui,sans-serif}}main{{max-width:1120px;margin:auto;padding:35px 28px 75px}}h1{{font-size:35px;line-height:1.2}}h2{{margin-top:36px}}h3{{margin-bottom:5px}}p{{max-width:980px}}.callout{{padding:19px 23px;background:#fff0dc;border-left:5px solid #a75f13}}.muted{{color:#536a7b}}table{{border-collapse:collapse;width:100%;font-size:14px;background:white;margin:18px 0}}th,td{{padding:10px;text-align:left;border-bottom:1px solid #d7e0e8;vertical-align:top}}th{{background:#e6edf3}}img{{width:100%;height:auto}}code{{font-size:12px;overflow-wrap:anywhere}}a{{color:#076397}}li{{margin:8px 0}}</style>
<main><p class="muted">23 October 2026 / Current assembled board / Simulation and engineering screens</p><h1>Flamingo: use the wait to remove risk</h1>
<div class="callout"><strong>The board passes its layout checks. Electrical qualification remains open.</strong>
<p>The strongest findings concern VDD transients, reset after short power interruptions, slot restart current, and cooling.</p>
<p>The circuit and all component placements remain unchanged. Every assembled component remains on top.</p></div>
<p>Board SHA-256: <code>{board_sha}</code>. The retained reports bind to this board. Numerical agreement does not establish physical model accuracy.</p>
<h2>Coverage</h2>{table(['Review','Executed cases'],[[k,v] for k,v in counts.items()])}
<p>The regression has {test_counts['pass']} passes, {test_counts['skip']} skips, and {test_counts['fail']} failures. The skips require a historical routing-search fixture.</p>
<p>The layout report retains 235 manufacturing warnings. JLCPCB acceptance of the BGA lands, mask, stencil, and filled/capped vias remains pending.</p>
<p>The 16 guardband cases retain earlier current assumptions. The capacitor comparison includes 48 historical-bank cases. Neither group qualifies the installed board.</p>
<h2>Findings and next actions</h2>{''.join(f'<h3>P{f["priority"]}: {esc(f["title"])}</h3><p>{esc(f["evidence"])}</p><p><strong>Next:</strong> {esc(f["action"])}</p>' for f in findings)}
<h2>Power margins at the accepted design currents</h2>{power_table}
<p>The selected example assumes a 200 ns edge, 0.5 us response delay, 5 nH interconnect inductance, and 1 nH mounting inductance per capacitor.</p>
<p>The regulator tolerance corners include reference accuracy, divider tolerance, TCR, and feedback leakage. The model prescribes the source current response.</p>
<p>VDD has a 1.10 to 1.16 V operating window. These conditional results do not predict actual TPS62903 waveforms.</p>
<p>The parameter sweep also evaluates lower resistance, lower inductance, feedback trim, and faster response. None closes both VDD voltage corners in this example.</p>
<img src="power-margins.png" alt="Conditional voltage margins versus assumed regulator response delay">
<p>The independent ngspice passive-network minimum agrees with SciPy within {numeric_error:.6f} mV. All eight power numerical controls pass.</p>
<h2>Reset and USB sensing</h2><img src="reset-cycles.png" alt="Residual reset voltage versus off time and example reset cycles">
<p>All 96 VBUS cases reach the digital high and low thresholds. Worst modeled delays are {passive['summary']['maximumAttachToHighMs']:.2f} ms after attach and {passive['summary']['maximumDetachToLowMs']:.2f} ms after detach.</p>
<p>Supply cases range from 4.75 to 5.5 V. The 5.5 V case is an extra sensitivity, outside the retained normal input screen.</p>
<p>The 5.25 V corner reaches {passive['summary']['vbusNormalMaximumSenseV']:.3f} V at the sense pin. The pin is explicitly 5 V tolerant, but powered-off behavior remains unmodeled.</p>
<p>The reset sweep forces VCCH to zero through an ideal source. Real discharge can be slower. A 300 ms simulated off interval is not an operating guarantee.</p>
<h2>Slot startup and restart</h2>{slot_table}
<p>A ratio above one exceeds the estimated SOA screen. A ratio below one does not qualify repetitive startup or thermal behavior.</p>
<p>The 12 V study uses the installed Si4497DY and 10 kohm gate resistors. The 3.3 V study uses the installed DMP2008UFG.</p>
<p>The <a href="https://www.vishay.com/docs/65748/si4497dy.pdf">Vishay datasheet</a> supplies the 70 A pulse limit and the single-pulse SOA curves. Their test conditions remain part of the screen.</p>
<p>Fixed-temperature models omit heat accumulation. Neither switch circuit has active current limiting or a fault latch.</p>
<h2>Current copper and thermal budget</h2>
<p>The 3.3 V load sweep covers all-VCCH, split, and all-VCCA33 bridge current, with 0 A and 3 A slot loads.</p>
<p>The DC solver now includes connector plated-hole barrels. The SPI header provides a real interlayer path even without an assembled header.</p>
<p>The bridge power allowance is {thermal_power:.2f} W. The required thermal resistance is at most {thermal['requiredThetaJA35C']:.2f} C/W at 35 C ambient, or {thermal['requiredThetaJA50C']:.2f} C/W at 50 C.</p>
<p>ASMedia reference heatsink data give 17.38 C/W in still air and 8.24 C/W at 1 m/s. These values do not predict this board.</p>
<h2>High-speed channel sensitivity</h2>{channel_table}
<p>The nominal uniform differential section is {data['pcie']['nominal_cross_section']['impedance_ohm']:.2f} ohms. Short necks, launches, vias, and return paths have separate limitations.</p>
<p>Capacitor models end at 6 GHz. The model extrapolates them for the 8 GHz PCIe and 10 GHz USB4 Nyquist frequencies.</p>
<p>Connector, package, die, cable, endpoint, and equalization models remain incomplete. The reported losses are PCB sensitivity results.</p>
<h2>First-board measurement plan</h2>
<ol><li>Start without a card. Measure input current, all bridge rails, reset, and the 25 MHz clock.</li>
<li>Capture cold startup and short ATX interruptions. Compare rail order and reset release with the datasheet.</li>
<li>Apply controlled loads to each slot rail. Record switch VDS, current, gate voltage, and temperature during startup and shutdown.</li>
<li>Measure VDD at the bridge during traffic and load changes. Capture both dips and release peaks with a low-inductance probe.</li>
<li>Repeat USB attach and detach with ATX on and off. Measure unexpected rail voltage and input current.</li>
<li>Start endpoint trials with low power. Record negotiated speeds, link errors, sustained transfers, and temperatures.</li></ol>
<h2>Reproduce and inspect</h2><p>Run <code>PCIE_SI_PYTHON=/path/to/si-python bun run sim:all</code>. The Python environment needs NumPy, SciPy, Shapely, and Matplotlib.</p>
<p>The command saves logs, exact SPICE decks, source hashes, and reports. A completed command does not imply electrical qualification.</p>
<p><a href="summary.json">Summary</a> / <a href="execution.json">Execution record</a> / <a href="power/results.json">Power cases</a> / <a href="passive/report.json">Passive corners</a> / <a href="slot12v/summary.json">12 V SOA screen</a> / <a href="slot3v3/results.json">3.3 V SOA screen</a> / <a href="channel.json">Channel model limits</a></p>
</main></html>'''
(OUT/'report.html').write_text(page)
print(OUT/'report.html')
