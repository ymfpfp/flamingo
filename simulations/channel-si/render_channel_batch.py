"""Render channel-by-channel evidence and explicit local-model limits."""
from pathlib import Path
import html,json,argparse
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT/'dist/si-channel-review/all-channels')
OUT=parser.parse_args().root.resolve()
data=json.loads((OUT/'results.json').read_text());plan=json.loads((OUT/'plan.json').read_text());esc=html.escape
job_data=json.loads((OUT/'jobs.json').read_text()) if (OUT/'jobs.json').exists() else {}
progress_path=next((OUT/n for n in ['progress.json','progress-all.json','progress-prototype.json'] if (OUT/n).exists()),None)
progress=json.loads(progress_path.read_text()) if progress_path else None

def table(headers,rows):
    return '<table><thead><tr>'+''.join('<th>'+esc(str(x))+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(str(x))+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'
def status(result):return 'Pending' if not result.get('complete') else 'PASS' if result.get('passed') else 'FAIL'

page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>USB4 and PCIe local PCB extraction</title><style>body{font:15px/1.6 system-ui;color:#173044;background:#f4f7fa}main{max-width:1200px;margin:auto;padding:30px}table{border-collapse:collapse;width:100%;background:white;margin:18px 0}th,td{padding:9px;text-align:left;border-bottom:1px solid #ddd}img{max-width:100%}.note{background:#fff0d9;border-left:5px solid #b76810;padding:18px}a{color:#065c98}code{overflow-wrap:anywhere}details{margin:20px 0}summary{font-weight:650;cursor:pointer}</style><main><h1>USB4 and PCIe local PCB extraction</h1>'''
passed=sum(c['allExtractionChecksPassed'] for c in data['channels'])
stackup_mismatch=(OUT/'fabrication-stackup-mismatch.json').exists()
if stackup_mismatch:
    mismatch=json.loads((OUT/'fabrication-stackup-mismatch.json').read_text())
    page+=f'<div class="note"><strong>Fabrication stackup mismatch: these results do not sign off the selected construction.</strong><p>The frozen model uses {esc(mismatch["frozenSIStackup"])} with {mismatch["frozenInnerCopperMm"]*1000:g} µm inner copper and {mismatch["frozenOuterDielectricMm"]:g} mm outer dielectric. The selected fabrication recipe is {esc(mismatch["selectedStackup"])} with {mismatch["selectedInnerCopperMm"]*1000:g} µm inner copper and {mismatch["selectedOuterDielectricMm"]:g} mm outer dielectric. Live cases finish for retained evidence; further queued runs are held until inputs are revised.</p></div>'
page+=f'<div class="note"><strong>{passed} of {len(data["channels"])} new local fixtures pass all extraction checks.</strong><p>These are nominal, lossless PCB transition models over 1–12 GHz. Component internals, bridge package, mated connectors and full-channel eye/BER remain outside this extraction.</p></div>'
mesh_open=[c['channel'] for c in data['channels'] if c['mesh'].get('complete') and not c['mesh']['passed']]
crop_open=[c['channel'] for c in data['channels'] if any(s.get('complete') and s['suite']=='crop' and not s.get('responseSensitivityPassed',s['passed']) for s in c['studies'])]
feed_open=[s for c in data['channels'] for s in c['studies'] if s.get('complete') and not s.get('feedFixture',{}).get('passed',True)]
page+='<p>Open accuracy findings: '+str(len(mesh_open))+' pairs exceed the XY mesh-change limit; crop sensitivity exceeds the limit on '+esc(', '.join(crop_open) or 'none of the completed studies')+'; '+str(len(feed_open))+' study runs fail the feed-fixture check.</p>'
if progress:page+=f'<p>Batch progress: {progress["finished"]}/{progress["total"]} simulations finished; {progress["failed"]} execution failures. Last update: {esc(progress["updatedUTC"])}.</p>'
if (OUT/'region-refinement-history.json').exists():
    region=json.loads((OUT/'region-refinement-history.json').read_text());failed=region['failedStudy']
    page+=f'<p>TX1 region refinement: the earlier common-mode comparison changed by {failed["maximumComplexChange"]:.5f}, above {failed["limit"]}. Its baseline margin is now {region["baselineCropMarginAfterMm"]} mm and the verification margin is {region["verificationCropMarginMm"]} mm. Earlier results remain in the refinement history; current qualification uses the expanded model.</p>'
if (OUT/'parallel-scheduling-change.json').exists() and not stackup_mismatch:
    page+='<p>Independent channels run concurrently with four total workers and one new job per channel. Existing TX1 jobs continue. Other channels do not wait for TX1 qualification; all extraction acceptance limits still apply separately to each channel.</p>'
if (OUT/'interrupted-attempts.json').exists():
    interrupted=json.loads((OUT/'interrupted-attempts.json').read_text())['attempts']
    page+=f'<p>{len(interrupted)} earlier attempt(s) were interrupted and replaced. Their records are retained separately and are excluded from accepted results.</p>'
page+='<p>The previously validated <a href="../em3d/report.html">USB4 RX2 transition</a> remains available separately. The <a href="../report.html">complete routed-channel sensitivity screen</a> covers the connecting trace lengths and component approximations.</p>'
if (OUT/'fixtures.png').exists():page+='<h2>Fixture coverage</h2><img src="fixtures.png" alt="Each local signal transition, ground stitches and measurement planes">'
rows=[]
for c in data['channels']:
    response=c['fine'].get('atNyquist',c['coarse'].get('atNyquist'))
    rows.append([c['channel'],status(c['coarse']),status(c['fine']),status(c['mesh']),
        f"{sum(s.get('passed',False) for s in c['studies'])}/{len(c['studies'])}",'PASS' if c['allExtractionChecksPassed'] else 'Open',
        f"{response['differentialInsertionLossDB']:.3f} dB" if response else 'Pending',
        f"{min(response['inputReturnLossDB'],response['outputReturnLossDB']):.2f} dB" if response else 'Pending',
        f"{response.get('worstThroughDifferentialToCommonDB',response['differentialToCommonDB']):.2f} dB" if response else 'Pending'])
page+=table(['Channel','Coarse numerics','Fine numerics','XY mesh','Other studies','All checks','Local IL at Nyquist','Weaker-end RL at Nyquist','Through D→C at Nyquist'],rows)
page+='<p>Nyquist is 10 GHz for USB4 and 8 GHz for PCIe in this design. IL is insertion loss; lower is better. RL is positive return loss; higher is better. Pending or failed qualification makes response values diagnostic.</p>'
page+='<h2>Acceptance method</h2><p>Each fixture uses four independent differential/common-mode excitations. The complete matrix uses S = B A⁻¹, including unwanted incident waves. No matrix symmetrization or passivity projection is applied.</p>'
if job_data.get('consistentGridComparison'):
    history_count=sum(j['suite']=='intermediate' or j['suite'].startswith('history-') for j in job_data['jobs'])
    page+=f'<p>Final coarse/fine comparisons use consistent feature rules at main XY steps of 25/20 µm. The simulation count includes {history_count} earlier TX1 runs retained as refinement history. Corrected source/load fixtures keep a 49.7 µm physical gap when the vertical grid changes.</p>'
page+=table(['Check','Limit'],[['Time-record change','< 0.01 complex amplitude'],['Passivity','Maximum singular value < 1.005'],['Reciprocity','Maximum |S − Sᵀ| < 0.01'],['Incident-matrix condition','< 10'],['XY mesh change','< 0.025 complex; differential IL change < 0.1 dB'],['Crop, absorber, vertical mesh and pad apertures','< 0.025 complex; differential IL change < 0.1 dB; time-record change < 0.01']])
page+='<p>These limits test extraction accuracy. A failed mesh or domain comparison leaves the model unqualified; it does not establish a hardware failure. No USB4 or PCIe compliance verdict is inferred from these limits.</p>'
page+='<p>Every native case also needs its sources outside the lateral absorber and a passive feed-load residual below 0.01. A sensitivity study fails if this fixture check fails, even when its response-change values pass.</p>'
page+='<p>The eight additional studies use differential and common-mode input from the later route port. They vary crop size, absorber distance, vertical mesh density and exposed-pad mask apertures. Common-mode transmission-magnitude changes are informational. Crop-edge copper profiles continue through the absorber; the physical board outline and cutout are retained.</p>'
page+=('<p>The baseline opens mask above pads explicitly marked as exposed in Circuit JSON, with zero aperture expansion. Nested copper islands retain the nominal coating where no opening is specified. The mask study compares continuous nominal coating.</p>' if data.get('exposedPadsOpenInBaseline') else '<p>The baseline uses nominal stepped solder-mask coating. The aperture study removes mask from pads explicitly marked as exposed in Circuit JSON, with zero aperture expansion. This tests sensitivity to a known physical construction detail.</p>')
page+='<h2>Calibration</h2>'
page+=table(['Independent line check','Value','Limit','Result'],[[c['name'],f"{c['value']:.6g}",c['limit'],'PASS' if c['passed'] else 'FAIL'] for c in data['calibration'].get('checks',[])])
if not data['calibration'].get('complete'):page+='<p>Corrected-fixture calibration is pending.</p>'
rot=data['rotationCalibration']
page+='<p>Rotated-probe agreement: '+(f"{rot['maximumComplexSChange']:.6g} complex amplitude, limit {rot['limit']}; "+('PASS' if rot['passed'] else 'FAIL') if rot.get('complete') else 'Pending')+'.</p>'
for ylabel,filename,which in [('Local differential insertion loss (dB)','local-il.png','il'),('Local weaker-end return loss (dB)','local-rl.png','rl'),('Local through differential-to-common conversion (dB)','local-conversion.png','conversion')]:
    fig,axes=plt.subplots(3,4,figsize=(14,9),layout='constrained')
    for ax,c in zip(axes.flat,data['channels']):
        plotted=False
        for suite,label in [('coarse','Coarse'),('fine','Fine')]:
            p=OUT/suite/f"{c['channel']}-matrix.npz"
            if not p.exists():continue
            d=np.load(p);s=d['s_mixed']
            v=(-20*np.log10(abs(s[:,1,0])) if which=='il' else
               np.minimum(-20*np.log10(abs(s[:,0,0])),-20*np.log10(abs(s[:,1,1]))) if which=='rl' else
               np.maximum(20*np.log10(np.maximum(abs(s[:,3,0]),1e-15)),20*np.log10(np.maximum(abs(s[:,2,1]),1e-15))))
            ax.plot(d['frequency']/1e9,v,label=label);plotted=True
        ax.set_title(c['channel']);ax.set(xlabel='GHz',xlim=(1,12));ax.grid(alpha=.25)
        if plotted:ax.legend(fontsize=8)
        else:ax.text(.5,.5,'Pending',ha='center',va='center',transform=ax.transAxes)
    for ax in list(axes.flat)[len(data['channels']):]:ax.set_visible(False)
    fig.suptitle(ylabel+' — nominal lossless PCB fixtures');fig.savefig(OUT/filename,dpi=140);plt.close(fig)
    page+='<h2>'+esc(ylabel)+'</h2><img src="'+filename+'" alt="'+esc(ylabel)+'">'
page+='<h2>Per-channel evidence</h2>'
for c in data['channels']:
    page+='<details><summary>'+esc(c['channel'])+' — '+esc(c['scope'])+'</summary>'
    for suite,title in [('coarse','Coarse'),('fine','Fine')]:
        r=c[suite];page+='<h3>'+title+'</h3>'
        if r.get('analysisError'):page+='<p>FAIL: '+esc(r['analysisError'])+'</p>'
        if r.get('complete'):page+=table(['Check','Value','Limit','Result'],[[v['name'],f"{v['value']:.7g}",v['limit'],'PASS' if v['passed'] else 'FAIL'] for v in r['checks']])
        else:page+='<p>Pending.</p>'
    if c['mesh'].get('complete'):
        m=c['mesh'];page+='<p>Largest mesh change: '+f"{m['maximumComplexChange']:.6g} at {m['worstFrequencyGHz']:.3g} GHz, {m['worstOutgoingMode']} ← {m['worstIncomingMode']}."+'</p>'
        if m.get('phaseChangeAtWorstDegrees') is not None:page+=f"<p>Phase difference at that point: {m['phaseChangeAtWorstDegrees']:.3f} degrees. The complex-change limit remains 0.025.</p>"
        page+=f"<p>Largest complex mesh change through Nyquist: {m['maximumComplexChangeThroughNyquist']:.6g}. Full-band differential insertion-loss change: {m['maximumDifferentialILChangeDB']:.6g} dB.</p>"
    barrel=OUT/(c['channel']+'-barrel-sampling.png')
    if barrel.exists():page+='<p>Barrel mesh diagnostic:</p><img src="'+barrel.name+'" alt="Metal sampling of the via barrel on coarse and fine grids">'
    page+=table(['Study','Mode','Complex change','Through magnitude change (dB)','Time-record change','Feed residual','Result'],[[s['suite'],s['mode'],f"{s['maximumComplexChange']:.6g}" if 'maximumComplexChange' in s else s.get('analysisError','Pending'),f"{s['throughMagnitudeChangeDB']:.6g}" if 'throughMagnitudeChangeDB' in s else 'Pending',f"{s['timeRecordSensitivity']:.6g}" if 'timeRecordSensitivity' in s else 'Pending',f"{s['feedFixture']['passiveGapIncidentToReflectedRatio']:.6g}" if 'feedFixture' in s else 'Pending',status(s)] for s in c['studies']])
    if c['fine'].get('complete') and (OUT/'fine'/f"{c['channel']}-matrix.npz").exists() and not c['fine'].get('analysisError'):
        d=np.load(OUT/'fine'/f"{c['channel']}-matrix.npz");name=c['channel']+('-local.s4p' if c['allExtractionChecksPassed'] else '-local-diagnostic.s4p')
        with (OUT/name).open('w') as stream:
            stream.write('! Local nominal lossless PCB transition only; 1-12 GHz.\n! Qualification and assumptions: results.json\n')
            if not c['allExtractionChecksPassed']:stream.write('! DIAGNOSTIC: qualification open or failed.\n')
            stream.write('! Ports 1/2 earlier P/N and 3/4 later P/N in chip-to-connector route order.\n# Hz S RI R 42.5\n')
            for f,s in zip(d['frequency'],d['s_single_ended']):
                for row in range(4):stream.write((f'{f:.12e} ' if row==0 else ' '*19)+' '.join(f'{v.real:.12e} {v.imag:.12e}' for v in s[row])+'\n')
        page+='<p><a href="'+name+'">Local four-port data</a>. Causality and time-domain use are not qualified.</p>'
    page+='</details>'
page+='<h2>Physical limits</h2><ul><li>Nominal selected stackup, Dk, solder mask and 20 µm hollow barrel plating; factory construction remains unconfirmed.</li><li>PEC copper and lossless dielectric isolate discontinuities. Production attenuation is additional.</li><li>One comparable local transition is extracted per pair. BGA/package internals and the other route sections require separate complete-channel integration.</li><li>Nearby copper is included. The four-port fixtures do not qualify inter-pair crosstalk or unknown component terminations.</li><li>Numerical acceptance does not determine a first-try probability or assembled-channel compliance.</li></ul>'
page+='<h2>Files</h2><p><a href="results.json">Detailed numerical results and hashes</a> · <a href="plan.json">Fixture coordinates and coverage</a> · <a href="'+('rotation-check.json' if (OUT/'rotation-check.json').exists() else '../all-channels/rotation-check.json')+'">Rotated calibration evidence</a>'
if progress_path:page+=' · <a href="'+progress_path.name+'">Batch progress</a>'
for name,label in [('jobs.json','Selected simulation arguments'),('fabrication-stackup-mismatch.json','Fabrication stackup mismatch'),('parallel-scheduling-change.json','Parallel scheduling change'),('region-refinement-history.json','Region refinement history'),('interrupted-attempts.json','Interrupted attempts'),('preflight-physical-model-comparison.json','Physical geometry comparison'),('selected-geometry-checks.json','Selected native geometry audit'),('feed-fixture-checks.json','Feed fixture audit'),('reproduction.json','Reproduction details'),('evidence-integrity-check.json','Evidence integrity audit')]:
    if (OUT/name).exists():page+=' · <a href="'+name+'">'+label+'</a>'
page+='</p></main></html>'
(OUT/'report.html').write_text(page);print(str(OUT/'report.html'))
