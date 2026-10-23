"""Publish a hash-bound comparison of the source-built slot-power copper."""
import hashlib,html,json,re,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from check_layout import ROOT

OUT=ROOT/'dist/slot-power-copper-review'
before=json.loads((OUT/'before-dc.json').read_text());after=json.loads((OUT/'after-dc.json').read_text())
preservation=json.loads((OUT/'preservation.json').read_text());refs=json.loads((OUT/'reference-preservation.json').read_text())
validation=json.loads((ROOT/'dist/validation/board.json').read_text())
sha=after['sourceSha256'];source=ROOT/after['sourceFile']
assert hashlib.sha256(source.read_bytes()).hexdigest()==sha
assert sha==preservation['sourceSha256']==refs['sourceSha256']==validation['sourceSha256']
assert before['sourceSha256']==preservation['baselineSha256']==refs['baselineSha256']
assert preservation['passed'] and refs['passed'] and validation['passed']
testlog=(OUT/'tests.log').read_text()
counts={name:int(re.search(r'^\s*(\d+) '+name+r'\s*$',testlog,re.M)[1])for name in ['pass','skip','fail']}
assert counts['fail']==0
assert 'error TS'not in (OUT/'typecheck.log').read_text()
def table(heads,rows):
 return '<table><tr>'+''.join('<th>'+html.escape(str(x))+'</th>'for x in heads)+'</tr>'+''.join('<tr>'+''.join('<td>'+html.escape(str(x))+'</td>'for x in row)+'</tr>'for row in rows)+'</table>'
channels=[]
for rail in ['12V','3V3']:
 a=next(c for c in before['channels']if c['rail']==rail);b=next(c for c in after['channels']if c['rail']==rail)
 old=a['conductorUpperDropMV']+a['mosfetDrop25CMaxRdsMV'];new=b['conductorUpperDropMV']+b['mosfetDrop25CMaxRdsMV']
 channels.append(dict(rail=rail,currentA=b['currentA'],beforeCopperMV=a['conductorUpperDropMV'],afterCopperMV=b['conductorUpperDropMV'],
  beforeTotalScreenMV=old,afterTotalScreenMV=new,mosfet25CMaxDropMV=b['mosfetDrop25CMaxRdsMV'],
  copperReductionPercent=100*(1-b['conductorUpperDropMV']/a['conductorUpperDropMV']),totalScreenReductionPercent=100*(1-new/old)))
voltage_cases=[]
for input_v in [12,11.4,11.2]:
 c=channels[0];slot=input_v-c['afterTotalScreenMV']/1000
 voltage_cases.append(dict(inputV=input_v,slotScreenV=slot,minimumV=11.04,remainingMarginMV=(slot-11.04)*1000))
parts=[('V12V','Input copper','#d68b27'),('SLOT_12V','Output copper','#bd4f57')]
fig,ax=plt.subplots(figsize=(8.5,5),layout='constrained');bottom=[0.,0.]
for net,label,color in parts:
 values=[next(r for r in report['results']if r['rail']==net)['withMeshAllowanceMV']for report in [before,after]]
 ax.bar(['Before','After'],values,bottom=bottom,label=label,color=color,width=.5)
 bottom=[a+b for a,b in zip(bottom,values)]
mos=channels[0]['mosfet25CMaxDropMV'];ax.bar(['Before','After'],[mos,mos],bottom=bottom,label='Unchanged MOSFET, 25 °C max Rds',color='#51728a',width=.5)
for i,value in enumerate([c+mos for c in bottom]):ax.text(i,value+10,f'{value:.1f} mV',ha='center',fontweight='bold')
ax.axhline(360,color='#946a16',ls='--',lw=1,label='Budget with 11.40 V input')
ax.axhline(160,color='#9c2727',ls='--',lw=1,label='Budget with 11.20 V input')
ax.axhspan(50,100,color='#91c7a1',alpha=.3,label='Complete-path design goal: 50–100 mV')
ax.set(ylabel='Screened 12 V path drop at 5.5 A (mV)',ylim=(0,600),title='Copper changes reduce loss; the complete-path target remains open')
ax.grid(axis='y',alpha=.15);ax.legend(fontsize=8,loc='upper right')
fig.supxlabel('80 °C copper with mesh allowance. Ground return, contacts and hot MOSFET resistance are excluded.',fontsize=8)
fig.savefig(OUT/'comparison.png',dpi=170);plt.close(fig)
report=dict(dateLocal='2026-10-22',sourceFile=after['sourceFile'],sourceSha256=sha,baselineSourceFile=before['sourceFile'],
 baselineSha256=before['sourceSha256'],scope='Requested steps 1–3: rebuild, locate loss and revise copper. Components and MOSFET choices are unchanged.',
 channels=channels,voltageCases=voltage_cases,preservation=preservation,referencePlanePreservation=refs,
 layoutValidationPassed=validation['passed'],regression=counts,typecheckPassed=True,
 limitations=after['limitations'],modelScope=after['scope'],
 inputSha256={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in [
  Path(__file__),ROOT/'simulations/power-distribution/check_slot_dc.py',ROOT/'manufacturing/stackup/selected.json',
  ROOT/'manufacturing/slot-power-routing/regions.json',ROOT/'manufacturing/slot-power-routing/surface-regions.json',
  ROOT/'manufacturing/slot-power-routing/surface-stitches.json',ROOT/'lib/slot-power-surface.tsx',ROOT/'index.circuit.tsx']})
(OUT/'results.json').write_text(json.dumps(report,indent=2)+'\n')
summary=table(['Rail / current','Copper before','Copper after','Total before','Total after'],[[f"{r['rail']} / {r['currentA']:g} A",f"{r['beforeCopperMV']:.1f} mV",f"{r['afterCopperMV']:.1f} mV",f"{r['beforeTotalScreenMV']:.1f} mV",f"{r['afterTotalScreenMV']:.1f} mV"]for r in channels])
voltages=table(['12 V input case','Screened slot voltage','Card minimum','Margin before omitted losses'],[[f"{r['inputV']:.2f} V",f"{r['slotScreenV']:.4f} V",'11.040 V',f"{r['remainingMarginMV']:.1f} mV"]for r in voltage_cases])
c=channels[0]
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slot-power copper comparison</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;background:#f5f7fa;color:#183345;margin:0}}main{{max-width:1060px;margin:auto;padding:32px 24px 70px}}h1{{line-height:1.2}}h2{{margin-top:32px}}table{{border-collapse:collapse;width:100%;background:white;font-size:14px;margin:18px 0}}th,td{{padding:10px;text-align:left;border-bottom:1px solid #d8e1e8}}th{{background:#e7eef3}}img{{max-width:100%}}code{{font-size:12px;overflow-wrap:anywhere}}a{{color:#005a94}}.callout{{background:#fff0db;border-left:5px solid #b77721;padding:18px 22px}}li{{margin:8px 0}}</style><main>
<p>22 October 2026 • source-built copper revision • steps 1–3</p><h1>Slot-power copper changes</h1>
<div class="callout"><strong>The screened 12 V copper loss falls by {c['copperReductionPercent']:.1f}%.</strong><p>The total screen falls from {c['beforeTotalScreenMV']:.1f} to {c['afterTotalScreenMV']:.1f} mV at 5.5 A. The MOSFET is unchanged.</p><p>The 50–100 mV complete-path goal remains open. The revised path still misses the 11.20 V input corner.</p></div>
<h2>Changes</h2><ul><li>Rebuilt the current source and repeated the original resistance screen.</li>
<li>Mapped the restrictive output path near the USB connector.</li>
<li>Added wider, parallel power copper on the outer layers. The output also uses a left-side bypass path.</li>
<li>Added 29 selected full-stack stitching vias. The native tscircuit solver selected their locations.</li>
<li>Disabled automatic stitching after pour generation. The baseline had no automatic vias. Existing via sites remain unchanged.</li>
<li>Removed two disconnected trial islands. The final source uses bounded native pour outlines.</li>
<li>Widened the nearby 3.3 V trunk and contact header to compensate for the added via clearances.</li></ul>
<h2>Resistance comparison</h2>{summary}<p>Totals include the existing MOSFET's maximum resistance at 25 °C. Copper uses the same 80 °C model and mesh allowance.</p>
<p>Ground return, connector contact resistance, hot MOSFET resistance and transient behavior remain excluded.</p>
<p>The 12 V and 3.3 V loads are separate stress cases. The combined card load must stay within 75 W.</p>
<img src="comparison.png" alt="Before and after voltage-drop budgets">
<h2>Voltage budget</h2>{voltages}<p>Positive margin here does not establish complete-path compliance. The omitted losses and transient dips consume additional margin.</p>
<p>The design target remains 50–100 mV for the complete hot path at 5.5 A. This is an engineering goal, not a standard requirement.</p>
<h2>Physical checks</h2><p>All {preservation['componentCount']} assembled components remain at their original top-side positions. All {preservation['traceCount']} existing trace paths remain unchanged.</p>
<p>All {preservation['previousViaCount']} existing via sites remain unchanged. The revised board has {preservation['viaCount']} vias.</p>
<p>L2/L5 ground changes are confined to the new via antipads. Their trace-projection checks pass.</p>
<p>Full layout validation passes. Native clearance, shorts, placement, routing style and physical supply-continuity checks pass.</p>
<p>The regression run has {counts['pass']} passes, {counts['skip']} skips and zero failures. TypeScript checking passes.</p>
<p>The bridge 3 A load qualification remains open. The board validator reports that result separately from layout validation.</p>
<p>These checks do not establish full-channel SI, thermal behavior, regulator transients or MOSFET startup/shutdown SOA.</p>
<h2>Copper and voltage maps</h2><p>The maps show the actual emitted copper and the fine-grid resistance solution before mesh allowance.</p>
<img src="after-plots/power-copper.png" alt="Revised power copper on all routed power layers">
<img src="after-plots/SLOT_12V-drop.png" alt="Revised output-path voltage-drop map">
<h2>Evidence</h2><p><a href="results.json">Comparison and input hashes</a> · <a href="before-dc.json">Before resistance model</a> · <a href="after-dc.json">After resistance model</a> · <a href="preservation.json">Trace, via and placement preservation</a> · <a href="reference-preservation.json">Ground-plane preservation</a> · <a href="validation-board.json">Full layout validation</a></p>
<p>After SHA-256: <code>{sha}</code><br>Before SHA-256: <code>{before['sourceSha256']}</code></p>
<p>Reproduction: build with <code>bun scripts/build-board.mjs</code>, then run the slot DC screen and full board validator. Python dependencies match the existing SI environment.</p>
<p>Limits: <a href="https://edc.intel.com/content/www/us/en/design/ipla/software-development-platforms/client/platforms/alder-lake-desktop/atx-version-3-0-multi-rail-desktop-platform-power-supply-design-guide/2.0/2.1/dc-voltage-regulation-required/">ATX 3 input range</a> · <a href="https://edc.intel.com/content/www/us/en/design/ipla/software-development-platforms/client/platforms/alder-lake-desktop/atx-version-3-0-multi-rail-desktop-platform-power-supply-design-guide/2.1/pcie-aic-auxiliary-power-connectors/">Card voltage range</a></p>
</main></html>'''
(OUT/'report.html').write_text(page)
print(json.dumps({'report':str(OUT/'report.html'),'channels':channels,'voltageCases':voltage_cases},indent=2))
