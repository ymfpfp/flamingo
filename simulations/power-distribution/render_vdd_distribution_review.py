"""Render the hash-bound VDD distribution review after all checks finish."""
import hashlib,html,json,re
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from shapely.ops import unary_union
from shapely.plotting import plot_polygon
from check_layout import ROOT,model

OUT=ROOT/'dist/vdd-distribution-review-2026-10-22'
def read(name):return json.loads((OUT/name).read_text())
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def table(headings,rows):
    cell=lambda tag,x:f'<{tag}>{html.escape(str(x))}</{tag}>'
    return '<table><tr>'+''.join(cell('th',x) for x in headings)+'</tr>'+''.join('<tr>'+''.join(cell('td',x) for x in row)+'</tr>' for row in rows)+'</table>'

before,after=read('before-dc.json'),read('after-dc.json')
source=OUT/'after.circuit.json';sha=digest(source)
execution=read('execution-status.json');bom=read('bom-preservation.json')
assert execution['sourceSha256']==bom['sourceSha256']==sha
assert all(execution[k]==0 for k in ['buildExitCode','testsExitCode','typecheckExitCode','validationExitCode','physicalChecksExitCode','nativeChecksExitCode','dynamicsExitCode','spiceExitCode'])
assert bom['electricalComponentAttributesUnchanged']
assert all(r[g]['numericalControls']['passed'] for dc in [before,after] for r in dc['results'] for g in ['coarse','fine'])
preservation,copper,refs,validation=[read(n) for n in ['preservation.json','copper-change.json','reference-preservation.json','validation.json']]
for r in [after,preservation,copper,refs,validation]:assert r['sourceSha256']==sha
assert digest(OUT/'before.circuit.json')==before['sourceSha256']==preservation['baselineSha256']
assert all(r['passed'] for r in [preservation,copper,refs,validation])
assert not preservation['addedVias'] and refs['addedViaSites']==0
native,physical=read('native-checks.json'),read('physical-checks.json')
assert native['sourceSha256']==physical['sourceSha256']==sha
assert native['passed'] and physical['passed']
log=(OUT/'tests.log').read_text()
tests={k:int(re.findall(r'^\s*(\d+) '+k+r'\s*$',log,re.M)[-1]) for k in ['pass','skip','fail']}
assert tests['fail']==0
assert 'error TS' not in (OUT/'typecheck.log').read_text()
loads=json.loads((ROOT/'simulations/power-dynamics/provisional-loads.json').read_text())
old_review=json.loads((ROOT/'dist/conservative-power-review-2026-10-22/dynamics/review-input.json').read_text())
rows=[]
for name in ['VDD','VCCL']:
    old,new=[next(r for r in d['results'] if r['rail']==name) for d in [before,after]]
    current=loads['rails'][name]['designCurrentA'];scale=current/3
    lo=next(r['regulatorMinimumV'] for r in old_review['rails'] if r['rail']==name)
    minimum=1.1 if name=='VDD' else 1.85
    rows.append(dict(rail=name,currentA=current,beforeMV=old['screeningUpperDropMV']*scale,
        afterMV=new['screeningUpperDropMV']*scale,afterStress3AMV=new['screeningUpperDropMV'],
        marginToConductorScreenMV=8-new['screeningUpperDropMV']*scale,
        conductorScreenPass=new['screeningUpperDropMV']*scale<=8,stress3APass=new['screeningUpperDropMV']<=8,
        reductionPercent=100*(1-new['screeningUpperDropMV']/old['screeningUpperDropMV']),
        fineMV=new['fine']['maximumDropMV']*scale,
        regulatorStaticMinimumV=lo,minimumStaticPinV=lo-new['screeningUpperDropMV']*scale/1000,
        remainingStaticMarginMV=(lo-minimum)*1000-new['screeningUpperDropMV']*scale))
assert all(r['conductorScreenPass'] for r in rows)
vdd,vccl=rows
dynamic=read('dynamics/results.json');spice=read('dynamics/spice-check.json')
assert dynamic['sourceSha256']==sha and spice['passed'] and all(c['passed'] for c in dynamic['numericChecks'])
examples=[]
for r in dynamic['summary']:
    up,down=[next(x for x in r['halfLoadStepExample'] if x['direction']==d) for d in ['up','down']]
    examples.append(dict(rail=r['rail'],minimumV=up['lowToleranceMinimumV'],maximumV=down['highToleranceMaximumV'],
        lowerMarginAfterRippleMV=up['lowCornerMarginWithRippleMV'],upperMarginAfterRippleMV=down['highCornerMarginWithRippleMV']))
inputs=[Path(__file__),ROOT/'lib/power-distribution.tsx',ROOT/'index.circuit.tsx',
    ROOT/'manufacturing/power-distribution/terminals.json',ROOT/'manufacturing/stackup/selected.json',
    ROOT/'simulations/power-dynamics/provisional-loads.json',ROOT/'simulations/power-distribution/check_dc.py',
    ROOT/'simulations/power-distribution/check_layout.py',ROOT/'simulations/power-distribution/compare_distribution_copper.py']
result=dict(dateLocal='2026-10-22',sourceFile=str(source.relative_to(ROOT)),sourceSha256=sha,
    baselineSha256=before['sourceSha256'],acceptedLoadFile='simulations/power-dynamics/provisional-loads.json',
    rails=rows,tests=tests,typecheckPassed=True,nativeChecks=native,physicalChecks=physical,
    preservation=preservation,electricalComponentsUnchanged=bom,copperChanges=copper['changes'],conditionalLoadStepExamples=examples,
    qualification=dict(acceptedLoadConductorScreensPass=True,retainedBothRail3AScreenPass=after['passed'],
        hardwareValidated=False,closedLoopConverterSimulated=False,actualPdxCurrentSpectrumKnown=False),
    limitations=['Conductor-only sheet-resistance model at 80 C. Equal current per supply ball; 20 um via plating is assumed.',
        'The unchanged allowance is the larger mesh result plus the greater of mesh disagreement and 20 percent of the fine result.',
        'Ground return, package losses and unequal ball loading are omitted. The current budgets are provisional.',
        'VCCL meets the 8 mV screen at its 1 A planning load. Its separate 3 A stress screen remains open.',
        'The load-step model uses prescribed current response and assumed inductance. It does not model the TPS62903 control loop.',
        'Startup, load steps, reset supervision, thermal behavior and vendor fabrication acceptance remain separate work.'],
    inputSha256={str(p.relative_to(ROOT)):digest(p) for p in inputs})
(OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n')
record={**result,'reportFile':str((OUT/'report.html').relative_to(ROOT))}
(ROOT/'manufacturing/power-distribution/vdd-distribution-review-2026-10-22.json').write_text(json.dumps(record,indent=2)+'\n')

fig,ax=plt.subplots(figsize=(8.2,4.4),layout='constrained')
for i,(label,color,key) in enumerate([('Before','#a1b4c0','beforeMV'),('After','#d98731','afterMV')]):
    ax.bar([x+(i-.5)*.3 for x in range(2)],[r[key] for r in rows],width=.28,label=label,color=color)
ax.axhline(8,color='#963c31',ls='--',label='8 mV project screen')
ax.set(xticks=[0,1],xticklabels=['VDD at 3 A','VCCL at 1 A'],ylabel='Conductor drop with mesh allowance (mV)',title='Accepted planning loads · 80 °C copper')
ax.legend();ax.grid(axis='y',alpha=.15);fig.savefig(OUT/'comparison.png',dpi=170);plt.close(fig)
fig,axes=plt.subplots(2,2,figsize=(10,10),layout='constrained')
for col,(file,label) in enumerate([('before.circuit.json','Before'),('after.circuit.json','After')]):
    data=model(read(file));copper_objects,nets=data[7:9]
    for row,layer in enumerate(['top','inner2']):
        ax=axes[row,col]
        for name,color in [('VCCL','#78afd2'),('VDD','#e8a044')]:
            shape=unary_union([o['shape'] for o in copper_objects if o['net']==nets[name] and layer in o['layers']])
            for p in getattr(shape,'geoms',[shape]):
                if p.geom_type=='Polygon':plot_polygon(p,ax=ax,add_points=False,color=color,alpha=.9)
        ax.set(title=f'{label} · {layer}',xlabel='X (mm)',ylabel='Y (mm)');ax.set_aspect('equal');ax.grid(alpha=.15)
        ax.set(xlim=(24.8,33),ylim=(93,101)) if row==0 else ax.set(xlim=(22,38),ylim=(79,102))
fig.savefig(OUT/'copper-comparison.png',dpi=170);plt.close(fig)
rail_table=table(['Rail / load','Before','After','Static minimum at chip'],[[f"{r['rail']} / {r['currentA']:g} A",f"{r['beforeMV']:.2f} mV",f"{r['afterMV']:.2f} mV",f"{r['minimumStaticPinV']:.5f} V"] for r in rows])
transient_table=table(['Rail','Conditional load increase minimum','Conditional release maximum'],[[r['rail'],f"{r['minimumV']:.4f} V",f"{r['maximumV']:.4f} V"] for r in examples])
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VDD distribution review</title>
<style>body{{font:15px/1.6 system-ui;background:#f4f7fa;color:#233a49;margin:0}}main{{max-width:1050px;margin:auto;padding:28px 24px 60px}}h1{{line-height:1.2}}h2{{margin-top:32px}}.result{{background:#e8f2ec;border-left:5px solid #3f8058;padding:16px 22px}}table{{border-collapse:collapse;width:100%;background:white;margin:20px 0}}td,th{{padding:10px;text-align:left;border-bottom:1px solid #d6e1e8}}th{{background:#e2ebf0}}img{{max-width:100%}}a{{color:#075f89}}code{{font-size:12px;overflow-wrap:anywhere}}li{{margin:7px 0}}</style><main>
<p>22 October 2026 · ASM2464PDX · Accepted provisional current budgets</p><h1>VDD distribution: more useful copper</h1>
<div class="result"><strong>VDD conductor loss decreases by {vdd['reductionPercent']:.1f}%.</strong><p>The 3 A screen decreases from {vdd['beforeMV']:.2f} to {vdd['afterMV']:.2f} mV, including the unchanged mesh allowance. It meets the 8 mV project limit.</p></div>
<h2>Implemented changes</h2><ul><li>A wider L3 feed reaches both bridge supply clusters.</li><li>Additional top copper feeds the existing VDD contacts.</li><li>A local BGA fill joins the supply lands through available copper. Pad spacing is 0.15 mm; trace and pour spacing is 0.20 mm.</li></ul>
<p>All {preservation['componentCount']} components, {preservation['traceCount']} traces and {preservation['viaCount']} vias retain their geometry. All assembly stays on top.</p><p>The selected layout adds no drill holes. The ground references and copper outside VDD/VCCL retain their geometry.</p>
<h2>Voltage-drop screen</h2>{rail_table}<img src="comparison.png" alt="Before and after conductor voltage drop">
<p>VCCL uses its accepted 1 A load. Its drop increases to {vccl['afterMV']:.2f} mV and remains below 8 mV.</p>
<p>The VDD bound has {vdd['marginToConductorScreenMV']:.3f} mV of margin to the 8 mV project screen. It includes the existing 20 percent mesh allowance.</p>
<p>The retained 3 A VCCL stress screen is {vccl['afterStress3AMV']:.2f} mV and remains open. This does not change the 1 A planning budget.</p>
<p>Static chip voltage subtracts conductor loss from the existing low regulator-tolerance corner. Ground return, package loss and ripple are additional.</p>
<h2>Copper comparison</h2><p>Orange is VDD. Blue is VCCL. The top row shows bridge contacts; the lower row shows the L3 feed.</p><img src="copper-comparison.png" alt="Before and after actual top and L3 power copper">
<h2>Checks</h2><p>{tests['pass']} tests pass, {tests['skip']} skip, and none fail. TypeScript, native connectivity, physical clearances, signal isolation, ground support, shorts and routing style pass.</p>
<p>The existing nonpolar-capacitor orientation advisory remains non-actionable. Its routed contacts and position are preserved.</p>
<p>The new current-conservation controls pass. Repeating the original model reproduces both previous bounds exactly.</p>
<h2>Load steps remain separate</h2>{transient_table}<p>These examples assume a 50% load step, 200 ns edge, 0.5 µs response delay and ideal maximum current slew.</p>
<p>They use separate voltage-tolerance corners before ripple. They remain conditional passive-network calculations; the regulator control loop is unmodeled.</p>
<p>VDD requires 1.10–1.16 V. The conditional example still needs improvement. This copper change closes the VDD DC screen.</p>
<h2>Evidence</h2><p><a href="results.json">Results and limits</a> · <a href="before-dc.json">Before DC</a> · <a href="after-dc.json">After DC</a> · <a href="preservation.json">Placement and route preservation</a> · <a href="copper-change.json">Copper changes</a> · <a href="reference-preservation.json">Ground preservation</a> · <a href="validation.json">Board checks</a> · <a href="tests.log">Regression log</a> · <a href="native-checks.json">Native checks</a> · <a href="physical-checks.json">Physical checks</a> · <a href="dynamics/results.json">Conditional dynamics</a></p>
<p>After SHA-256: <code>{sha}</code><br>Before SHA-256: <code>{before['sourceSha256']}</code></p><p>Actual chip currents, hardware voltage, temperatures and fabrication acceptance remain unverified.</p></main></html>'''
(OUT/'report.html').write_text(page)
print(json.dumps(dict(report=str(OUT/'report.html'),rails=rows,tests=tests),indent=2))
