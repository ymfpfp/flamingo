"""Create the hash-bound report for the wider copper and selected inner foil."""
import hashlib, html, json, re
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from check_layout import ROOT

OUT = ROOT / 'dist/slot-power-inner-copper-review'
def read(name):
    return json.loads((OUT / name).read_text())
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def table(headings, rows):
    cell = lambda tag, value: f'<{tag}>{html.escape(str(value))}</{tag}>'
    return '<table><tr>' + ''.join(cell('th', x) for x in headings) + '</tr>' + ''.join(
        '<tr>' + ''.join(cell('td', x) for x in row) + '</tr>' for row in rows) + '</table>'

before, after = read('before-dc.json'), read('after-dc.json')
preservation, references = read('preservation.json'), read('reference-preservation.json')
bom = read('bom-preservation.json')
validation, impedance = read('validation-board.json'), read('stackup-impedance.json')
source = OUT / 'after.circuit.json'
stackfile = ROOT / 'manufacturing/stackup/selected.json'
stack = json.loads(stackfile.read_text())
sha = digest(source)
assert sha == after['sourceSha256'] == preservation['sourceSha256'] == references['sourceSha256'] == validation['sourceSha256']
assert before['sourceSha256'] == preservation['baselineSha256'] == references['baselineSha256']
assert digest(stackfile) == after['stackupSha256'] == impedance['stackupSha256']
assert preservation['passed'] and references['passed'] and validation['passed']
assert bom['allSourcePartsUnchanged'] and bom['sourceSha256'] == sha
testlog = (OUT / 'tests.log').read_text()
counts = {name: int(re.search(r'^\s*(\d+) ' + name + r'\s*$', testlog, re.M)[1]) for name in ['pass', 'skip', 'fail']}
assert counts['fail'] == 0
assert 'error TS' not in (OUT / 'typecheck.log').read_text()
channels = []
for rail in ['12V', '3V3']:
    old, new = [next(c for c in r['channels'] if c['rail'] == rail) for r in [before, after]]
    channels.append(dict(rail=rail, currentA=new['currentA'], beforeCopperMV=old['conductorUpperDropMV'],
        afterCopperMV=new['conductorUpperDropMV'], mosfet25CMaxDropMV=new['mosfetDrop25CMaxRdsMV'],
        beforeTotalMV=old['conductorUpperDropMV'] + old['mosfetDrop25CMaxRdsMV'],
        afterTotalMV=new['conductorUpperDropMV'] + new['mosfetDrop25CMaxRdsMV'],
        copperReductionPercent=100 * (1 - new['conductorUpperDropMV'] / old['conductorUpperDropMV'])))
c = channels[0]
voltage = [dict(inputV=v, slotV=v-c['afterTotalMV']/1000, minimumV=11.04,
    remainingMarginMV=(v-11.04)*1000-c['afterTotalMV']) for v in [12, 11.4, 11.2]]
hot_sensitivity = [dict(assumedRdsMilliohm=r, mosfetDropMV=5.5*r,
    totalDropMV=c['afterCopperMV']+5.5*r,
    marginAt11V2MV=160-c['afterCopperMV']-5.5*r) for r in [13, 16, 20, 25]]
trial1, trial2 = read('trial-1-coarse-dc.json'), read('trial-2-coarse-dc.json')
def output_drop(trial):
    rows = trial['results'] if isinstance(trial, dict) else trial
    return next(r['dropMV'] for r in rows if r['rail']=='SLOT_12V')
shortcut_gain = output_drop(trial1)-output_drop(trial2)
results = dict(sourceFile=str(source.relative_to(ROOT)), sourceSha256=sha,
    baselineSha256=before['sourceSha256'], stackupCode=stack['code'], stackupSha256=digest(stackfile),
    channels=channels, voltageCases=voltage, hotMosfetSensitivity=hot_sensitivity,
    bottomShortcutCoarseGainMV=shortcut_gain, nominalPairOhms=impedance['surfacePair'][-1]['impedance_ohm'],
    layoutPassed=validation['passed'], bomUnchanged=bom['allSourcePartsUnchanged'],
    fabricationReady=validation['reports']['drc']['fabricationReady'],
    regression=counts, typecheckPassed=True,
    limitations=after['limitations'], modelScope=after['scope'],
    inputSha256={str(p.relative_to(ROOT)):digest(p) for p in [Path(__file__), stackfile,
        ROOT/'simulations/power-distribution/check_slot_dc.py', ROOT/'simulations/power-distribution/check_dc.py',
        ROOT/'lib/power-distribution.tsx', ROOT/'lib/slot-power-surface.tsx',
        ROOT/'manufacturing/slot-power-routing/regions.json', ROOT/'manufacturing/slot-power-routing/surface-regions.json',
        ROOT/'manufacturing/slot-power-routing/surface-stitches.json', ROOT/'index.circuit.tsx']})
(OUT/'results.json').write_text(json.dumps(results, indent=2)+'\n')

fig, ax = plt.subplots(figsize=(8.4, 4.8), layout='constrained')
bottom = [0., 0.]
for rail, label, color in [('V12V','Input copper','#b67c25'),('SLOT_12V','Output copper','#c75154')]:
    values = [next(r for r in report['results'] if r['rail']==rail)['withMeshAllowanceMV'] for report in [before, after]]
    ax.bar(['Before', 'After'], values, bottom=bottom, color=color, label=label, width=.5)
    bottom = [a+b for a,b in zip(bottom,values)]
ax.bar(['Before','After'],[c['mosfet25CMaxDropMV']]*2,bottom=bottom,color='#4b718b',label='AO4407A: maximum Rds at 25 °C',width=.5)
for x, y in enumerate([c['beforeTotalMV'], c['afterTotalMV']]):
    ax.text(x,y+5,f'{y:.1f} mV',ha='center',fontweight='bold')
ax.axhline(160,ls='--',color='#962f32',label='160 mV budget at 11.20 V input')
ax.set(ylabel='12 V path drop at 5.5 A (mV)',ylim=(0,max(c['beforeTotalMV']+40,340)),title='Wider copper and thicker inner foil')
ax.grid(axis='y',alpha=.15)
ax.legend(fontsize=8,loc='upper right')
fig.supxlabel('80 °C copper, with mesh allowance. Contacts, ground return and transients are excluded.',fontsize=8)
fig.savefig(OUT/'comparison.png',dpi=170)
plt.close(fig)
summary = table(['Rail / current','Copper before','Copper after','Total before','Total after'],[
    [f"{r['rail']} / {r['currentA']:g} A",f"{r['beforeCopperMV']:.1f} mV",f"{r['afterCopperMV']:.1f} mV",
     f"{r['beforeTotalMV']:.1f} mV",f"{r['afterTotalMV']:.1f} mV"] for r in channels])
voltage_table = table(['Input at board','Screened slot voltage','Slot minimum','Margin before omitted losses'],[
    [f"{r['inputV']:.2f} V",f"{r['slotV']:.4f} V",'11.040 V',f"{r['remainingMarginMV']:+.1f} mV"] for r in voltage])
hot_table = table(['Assumed MOSFET resistance','MOSFET drop','Copper + MOSFET','Margin at 11.20 V'],[
    [f"{r['assumedRdsMilliohm']:g} mΩ",f"{r['mosfetDropMV']:.1f} mV",f"{r['totalDropMV']:.1f} mV",f"{r['marginAt11V2MV']:+.1f} mV"] for r in hot_sensitivity])
outcome = 'misses' if voltage[-1]['remainingMarginMV'] < 0 else 'meets'
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wider slot-power copper and thicker inner foil</title><style>
body{{font:16px/1.6 system-ui,sans-serif;color:#203748;background:#f4f7fa;margin:0}}main{{max-width:1050px;margin:auto;padding:30px 24px 64px}}h1{{line-height:1.2}}h2{{margin-top:32px}}.callout{{background:#fff1df;border-left:5px solid #b96e28;padding:16px 22px}}table{{border-collapse:collapse;width:100%;font-size:14px;background:white;margin:18px 0}}th,td{{padding:10px;text-align:left;border-bottom:1px solid #d8e2e8}}th{{background:#e4edf2}}img{{max-width:100%}}a{{color:#005f8d}}code{{font-size:12px;overflow-wrap:anywhere}}li{{margin:8px 0}}
</style><main><p>22 October 2026 · Requested steps 1 and 2 · MOSFETs unchanged</p>
<h1>Wider slot-power copper and thicker inner foil</h1>
<div class="callout"><strong>The 12 V copper loss decreases by {c['copperReductionPercent']:.1f}%.</strong>
<p>The copper screen decreases from {c['beforeCopperMV']:.1f} to {c['afterCopperMV']:.1f} mV at 5.5 A.</p>
<p>The total screen includes {c['mosfet25CMaxDropMV']:.1f} mV for the existing AO4407A at 25 °C.</p>
<p>That total {outcome} the 160 mV budget at an 11.20 V input. Full-path qualification remains open.</p></div>
<h2>Implemented changes</h2><ul>
<li>Wider 12 V input branches on L3 and L4, from 4.6 to 6.6 mm.</li>
<li>A parallel L3 bypass along the left edge, near Y = 78–107 mm.</li>
<li>A local VCCL boundary adjustment that gives the new bypass its required clearance.</li>
<li>A trial bottom copper branch near Y = 66–69 mm. Its coarse-model improvement is only {shortcut_gain:.3f} mV.</li>
<li>The selected JLC061611-3313G stackup uses 30 µm inner copper. The outer foil remains 35 µm.</li>
</ul><p>The manufacturer calls this construction 1 oz inner copper. The model uses the published 30 µm thickness.</p>
<p>Existing control traces interrupt the direct bottom connection. That trial branch does not remove the main voltage loss.</p>
<p>The earlier 35 µm study used an ideal thickness. This report uses the selected manufacturer's actual construction.</p>
<p>The AO4407A and DMP2008UFG-7 remain unchanged. No parts or signal paths moved.</p>
<h2>Voltage-drop results</h2>{summary}
<p>Copper uses 80 °C resistivity. Each path uses two mesh sizes and the existing allowance formula.</p>
<p>The allowance uses the larger mesh result plus the greater of mesh disagreement and 25% of the fine result.</p>
<p>The MOSFET figures use maximum resistance at 25 °C. They do not establish hot-device operation.</p>
<p>The 5.5 A and 3 A loads are separate rail cases. The combined card load must remain within 75 W.</p>
<img src="comparison.png" alt="Before and after copper and MOSFET voltage drop">
<h2>Lowest-input result</h2>{voltage_table}
<p>The input voltage is the voltage at the board's ATX 12 V feed pads. Cable loss consumes margin before those pads.</p>
<p>The calculation excludes connector contacts, ground return and transient dips. Positive margin does not establish complete-path compliance.</p>
<p>The previous copper target was 80 mV with a proposed lower-resistance MOSFET. This revision retains the existing MOSFET.</p>
<p>With its 71.5 mV cold-device drop, only 88.5 mV remains for copper before all omitted losses.</p>
<h2>Effect of MOSFET heating</h2>{hot_table}
<p>These resistance values are sensitivity cases. They are not AO4407A temperature guarantees.</p>
<p>The MOSFET needs a matching hot-device limit and a junction-temperature calculation for full qualification.</p>
<h2>Geometry and signal checks</h2>
<p>All {preservation['componentCount']} components remain at their original top-side positions.</p>
<p>All {preservation['traceCount']} existing traces and all {preservation['viaCount']} vias retain their geometry.</p>
<p>The L2 and L5 ground-plane shapes remain identical to the baseline.</p>
<p>The selected stackup changes the outer dielectric from 0.0994 to 0.092 mm.</p>
<p>The independent 2D pair model gives {impedance['surfacePair'][-1]['impedance_ohm']:.2f} Ω with the existing trace geometry. The final mesh change is {impedance['meshChangeOhms']:.3f} Ω.</p>
<p>This nominal result meets the 85 Ω ±10% target. Full-channel loss, launches and fabrication tolerance still need separate review.</p>
<p>The layout checks pass, including physical supply continuity, clearances, shorts, placement, routing style and signal isolation.</p>
<p>The regression run has {counts['pass']} passes, {counts['skip']} skips and zero failures. The TypeScript check passes.</p>
<p>Existing fabrication warnings remain. Vendor process acceptance remains open, and this layout result does not establish fabrication readiness.</p>
<p>The existing bridge 3 A load qualification remains open. The layout result does not close that separate power review.</p>
<h2>Copper and voltage maps</h2><p>The voltage maps show the fine solution before the mesh allowance.</p>
<img src="after-plots/power-copper.png" alt="Actual power copper on top, L3, L4 and bottom">
<img src="after-plots/V12V-drop.png" alt="Input path voltage drop">
<img src="after-plots/SLOT_12V-drop.png" alt="Output path voltage drop">
<h2>Evidence</h2><p><a href="results.json">Results and input hashes</a> · <a href="before-dc.json">Before DC model</a> · <a href="after-dc.json">After DC model</a> · <a href="preservation.json">Trace and placement preservation</a> · <a href="reference-preservation.json">Ground preservation</a> · <a href="stackup-impedance.json">Impedance model</a> · <a href="validation-board.json">Layout checks</a> · <a href="tests.log">Regression log</a></p>
<p>After SHA-256: <code>{sha}</code><br>Before SHA-256: <code>{before['sourceSha256']}</code><br>Stackup SHA-256: <code>{digest(stackfile)}</code></p>
<p><a href="../../manufacturing/stackup/selected.json">Selected fabrication recipe</a> · <a href="../../manufacturing/stackup/inner-copper-research-2026-10-22.json">Manufacturer stackup evidence</a> · <a href="../../datasheets/research/slot-input-voltage-2026-10-22.json">Input voltage assumptions</a> · <a href="../slot-power-mosfet-review/report.html">MOSFET evidence</a></p>
<p><a href="https://jlcpcb.com/impedance">JLCPCB stackup table</a> · <a href="https://jlcpcb.com/help/article/jlcpcb-copper-weight">JLCPCB copper rules</a></p>
<p>The DC screen does not qualify thermal behavior, regulator transients, startup, shutdown or MOSFET SOA.</p>
</main></html>'''
(OUT/'report.html').write_text(page)
print(json.dumps(dict(report=str(OUT/'report.html'), channels=channels, voltageCases=voltage),indent=2))
