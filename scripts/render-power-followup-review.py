"""Render the source-bound follow-up. Analysis completion is not qualification."""
import hashlib, html, json, re, shutil
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'dist/power-followup-2026-10-27'
OUT = BASE / 'final'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
run = read(OUT/'execution-final.json')
assert run.get('completed'), 'Checks have not finished'
board = ROOT/run['sourceFile']; digest=sha(board)
assert digest == run['sourceSha256']
old = read(BASE/'slot3v3-soa-final/results.json')
new = read(OUT/'slot3v3-soa-final/results.json')
ambient = read(OUT/'slot3v3-65c/results.json')
power = read(OUT/'power/results.json')
for d in [new,ambient,power]: assert d['sourceSha256']==digest
basecases=[r for r in new['results'] if 'sensitivity' not in r]
extras=[r for r in new['results'] if 'sensitivity' in r]
shutdown=lambda d:max((r['events'].get('shutdown',{}).get('equivalentRatio',0) for r in d['results']),default=0)
slot12 = read(OUT/'slot12v-final/summary.json'); assert slot12['sourceSha256']==digest
# The 65 C 12 V run predates the 3.3 V-only BOM substitution. Its geometry,
# every 12 V component and every 12 V control connection are preserved.
slot12_65=read(BASE/'slot12v-65c/summary.json')
preservation=read(OUT/'preservation.json');assert preservation['passed'] and preservation['sourceSha256']==digest
fresh={}
for key,file in [('validation','dist/validation/board.json'),('coreDC','dist/power-distribution/dc-audit.json'),('slotDC','dist/slot-power-routing/dc-audit.json'),('shared3v3DC','dist/vcch-routing/dc-audit.json'),('input5vDC','dist/atx5v-routing/dc-audit.json')]:
 p=ROOT/file;d=read(p);assert d['sourceSha256']==digest,(key,d.get('sourceSha256'))
 shutil.copyfile(p,OUT/(key+'.json'));fresh[key]={'file':str((OUT/(key+'.json')).relative_to(ROOT)),'sha256':sha(p)}
text=(OUT/'tests-final.log').read_text();counts={k:int(re.search(r'(\d+) '+k,text).group(1)) for k in ['pass','skip','fail']};assert counts['fail']==0
worst=min((r for r in power['transientCases'] if r['rail']=='VDD'),key=lambda r:min(r['lowCornerMarginWithRippleMV'],r['highCornerMarginWithRippleMV']))
report={
 'dateLocal':'2026-10-27','status':'Shutdown improved; VDD and rapid source-restart screens remain open',
 'completedRequestedFixes':False,'hardwareQualified':False,'ambientLimitC':40,
 'sourceFile':str(board.relative_to(ROOT)),'sourceSha256':digest,'stackupCode':'JLC06161H-3313',
 'stackupSha256':sha(ROOT/'manufacturing/stackup/selected.json'),
 'hardwareChange':{'component':'R_SLOT_OFF_3V3','fromOhm':100000,'toOhm':22000,'part':'0402WGF2202TCE','supplier':'JLCPCB C25768',
 'offTimeConstantMs':{'old':1000,'new':220},'onTimeConstantMs':{'old':510*100000/(510+100000)*.01,'new':510*22000/(510+22000)*.01},
 'scope':'Same lands, position, timing capacitor and 510 ohm turn-on resistor. No power or signal route changes.'},
 'shutdownScreen':{'oldWorstEquivalentRatio':shutdown(old),'newWorstEquivalentRatio':shutdown(new),
 'oldOutsideCases':sum(r['events'].get('shutdown',{}).get('equivalentRatio',0)>1 for r in old['results']),
 'newOutsideCases':sum(r['events'].get('shutdown',{}).get('equivalentRatio',0)>1 for r in new['results'])},
 'slot3v3':{'originalCases':len(basecases),'originalOutsideEquivalentScreen':sum(r['largestEquivalentRatio']>1 for r in basecases),
 'additionalCases':len(extras),'additionalOutsideEquivalentScreen':sum(r['largestEquivalentRatio']>1 for r in extras),
 'unsettled':sum(not r['settled'] for r in new['results']),'preEnableOffFailures':sum(not r['preEnableOffPassed'] for r in new['results']),
 'at65C':{'cases':len(ambient['results']),'outsideEquivalentScreen':ambient['summary'][0]['outsideEquivalentScreen'],
 'controlRestartOutsideCases':sum(r['kind']=='control-restart' and r['largestEquivalentRatio']>1 for r in ambient['results'])}},
 'operatingTemperatureScreen':{'ambientC':40,'initialSwitchTemperatureC':65,
 'basis':'Reference-board steady heating with twice the 25 C maximum Rds gives about 64.2 C for 3.3 V and 62.3 C for 12 V; rounded to 65 C.',
 'limitation':'This estimate excludes heat from the bridge, measured PCB thermal resistance and accumulated switching heat. It is not a guaranteed junction-temperature bound.'},
 'slot12vAt65C':{'cases':slot12_65['cases'],'worstEquivalentRatio':max(s['worstEquivalent']['equivalentRatio'] for s in slot12_65['summary']),
 'numericsPassed':slot12_65['numericalChecks']['passed'],'sourceSha256':slot12_65['sourceSha256'],
 'applicability':'Same complete 12 V circuit and copper. Only the independent 3.3 V gate pull-up changed afterward.'},
 'vdd':{'closedLoopValidated':False,'worstRetainedCase':worst,
 'status':'Retained full-load, delay, inductance and degraded-ESR sensitivities still exceed limits.',
 'blockedBy':'The official TPS62903 and TPS543620 transient libraries are encrypted and cannot run in the local ngspice engine. TI WEBENCH did not finish generating a design after selected-part and generic retries.',
 'handoffFile':'pspice-handoff/handoff.json','handoffStatus':'Four source-bound TI PSpice decks exported, not executed or validated.'},
 'preservation':preservation,'tests':counts,'executionFile':str((OUT/'execution-final.json').relative_to(ROOT)),'freshChecks':fresh,
 'openItems':['Rapid source-interruption cases remain outside the approximate 3.3 V SOA screen. The model uses a bidirectional voltage source; it can absorb reverse capacitor current and is not a validated ATX shutdown model.',
 'The hypothetical 125 C preheated cases remain available as stress tests. A 40 C air requirement does not by itself prove switch temperature.',
 'The SOA procedure derates an approximate ohmic boundary as well as the power envelope. Its low-VDS flags need model review; they are not proof of thermal failure. No criterion was relaxed to mark the hardware fixed.',
 'VDD requires a usable controller simulation or measured load-step response before a larger capacitor bank or replacement converter can be verified.',
 'The existing reset RC still does not monitor every late, missing or brownout rail fault.',
 'The separate VCCL 3 A stress case and doubled-resistance 3.3 V DC sensitivity remain outside their targets.',
 'No new delivered quote or fabrication release was produced.'],
 'rejectedTrials':['A 2.2 uF gate capacitor passed the original grid but missed shorter interruptions. It was not applied.',
 'Faster 12 V RC variants increased startup power substantially and were not applied.',
 'An exploratory Schottky fit failed off-state behavior; it was invalid for part selection and was not applied.',
 'Ideal source-disconnect models did not complete numerical validation and were not used to claim a pass.'],
 'sources':[{'title':'TI TPS62903','url':'https://www.ti.com/lit/ds/symlink/tps62903.pdf'},
 {'title':'Nexperia SOA methods','url':'https://www.nexperia.com/applications/interactive-app-notes/IAN50006_Power_MOSFETs_in_linear_mode'}]}
latest_vdd_path=ROOT/'manufacturing/vdd-loadstep-review-2026-10-27.json'
latest_vdd_html=''
if latest_vdd_path.exists():
 latest_vdd=read(latest_vdd_path)
 assert latest_vdd['sourceSha256']==digest
 assert latest_vdd['stackupSha256']==report['stackupSha256']
 report['vdd']['latestAttemptFile']=str(latest_vdd_path.relative_to(ROOT))
 report['vdd']['latestAttemptStatus']=latest_vdd['status']
 latest_vdd_html='<div class="status"><strong>Latest VDD attempt: still unverified.</strong><p>Mac model trials did not establish a fix. Twelve current-circuit tests are ready for PSpice, with the original TI signature file.</p><p><a href="../../vdd-loadstep-2026-10-27/report.html">Read the latest VDD report and download the test package</a>.</p></div>'
(OUT/'review.json').write_text(json.dumps(report,indent=2)+'\n')
(ROOT/'manufacturing/power-followup-review-2026-10-27.json').write_text(json.dumps(report,indent=2)+'\n')
e=html.escape
li=lambda a:'<ul>'+''.join('<li>'+e(s)+'</li>' for s in a)+'</ul>'
body=f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Flamingo power follow-up</title><style>body{{font:17px/1.55 system-ui;max-width:920px;margin:45px auto;padding:0 22px;color:#202124}}h1{{font-size:29px}}h2{{font-size:21px;margin-top:30px}}.status{{background:#fff0dc;border-left:5px solid #a94b00;padding:17px}}code{{font-size:12px;overflow-wrap:anywhere}}a{{color:#145db5}}td,th{{padding:8px 12px;border-bottom:1px solid #ddd;text-align:left}}table{{border-collapse:collapse}}</style>
<h1>Flamingo: power follow-up</h1><p>27 October 2026 · cheaper JLC06161H-3313 stackup · 40°C air requirement</p>
<div class="status"><strong>Shutdown improved. The full request is not complete.</strong><br>VDD load changes and rapid source-restart cases remain open.</div>
{latest_vdd_html}
<h2>Change applied</h2><p>Changed the 3.3 V switch pull-up from 100 kΩ to 22 kΩ. The gate-off time constant falls from 1 second to 0.22 seconds. Turn-on timing changes by less than 2%. All {preservation['componentCount']} part positions and {preservation['traceCount']} trace routes are preserved. Parts remain on top.</p>
<p>The five original shutdown cases outside the estimated SOA screen now pass that screen. The worst shutdown ratio fell from {shutdown(old):.2f} to {shutdown(new):.2f}; a ratio below 1 is inside this approximate screen.</p>
<h2>Fresh check results</h2><table><tr><th>Check</th><th>Result</th></tr><tr><td>Regression tests</td><td>{counts['pass']} pass, {counts['skip']} skip, {counts['fail']} fail</td></tr><tr><td>PCB checks and planned DC supply loads</td><td>Pass; separate stress cases remain open</td></tr><tr><td>3.3 V original switch grid</td><td>{len(basecases)} cases; {report['slot3v3']['originalOutsideEquivalentScreen']} source-restart cases outside the screen</td></tr><tr><td>Additional 3.3 V restart cases</td><td>{len(extras)} cases; {report['slot3v3']['additionalOutsideEquivalentScreen']} outside the screen</td></tr><tr><td>12 V switch at 65°C initial temperature</td><td>{slot12_65['cases']} cases; maximum equivalent ratio {report['slot12vAt65C']['worstEquivalentRatio']:.3f}; numerical checks pass</td></tr><tr><td>VDD full load-change checks</td><td>Still outside limits in retained sensitivity cases</td></tr></table>
<h2>40°C air and switch temperature</h2><p>The reference-board heating estimate gives about 62–64°C in the switches. I also ran a 65°C screen. This is a screening estimate: nearby chip heat, the actual PCB and repeated switching still need thermal validation. The 125°C preheated stress cases were retained.</p>
<h2>Why VDD is still open</h2><p>The current test prescribes a current response. It does not simulate the real regulator controller. The retained worst case reaches {worst['highToleranceMaximumV']:.4f} V at the high-voltage corner before ripple, above the 1.16 V limit. More bulk capacitance behind the existing damping resistors did not clear the full test range.</p><p>The TI transient libraries cannot run in the local simulator. The browser designer also stalled. I exported <a href="pspice-handoff/handoff.json">four PSpice test decks</a> with the real controller model and the current board's passive network. These decks have not been run. They are a handoff for a compatible simulator, not a passing result.</p>
<h2>Remaining work</h2>{li(report['openItems'])}
<h2>Evidence</h2><p><a href="review.json">Full review</a> · <a href="execution-final.json">Fresh execution record</a> · <a href="preservation.json">Layout preservation</a> · <a href="tests-final.log">Regression log</a> · <a href="validation-final.log">PCB and supply log</a> · <a href="power/results.json">VDD results</a> · <a href="slot3v3-soa-final/results.json">Restart results</a></p><p>Checked board SHA-256: <code>{digest}</code></p></html>'''
(OUT/'report.html').write_text(body)
# Main follow-up URL remains useful when the browser is refreshed.
(BASE/'report.html').write_text('<!doctype html><meta http-equiv="refresh" content="0;url=final/report.html"><a href="final/report.html">Open the latest power follow-up</a>')
print(json.dumps({'report':str(OUT/'report.html'),'status':report['status'],'shutdown':report['shutdownScreen'],'tests':counts},indent=2))
