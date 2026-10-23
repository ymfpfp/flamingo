"""Summarize raw numerical checks, controls and declared sensitivity tests."""
from pathlib import Path
import hashlib,html,json,shutil
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from refined_checks import line_controls,compare_case,compare_matrices

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review/em3d';ITER=OUT/'iterations'
def get(path):return json.loads(path.read_text()) if path.exists() else None
coarse=get(ITER/'line-continued/checks-0.04.json')
fine=get(ITER/'line-continued/checks-0.025.json')
controls=line_controls()
source_comparison=get(OUT/'current-source-comparison.json')
model_consistency=get(ITER/'line-continued/model-consistency.json')
feed_checks=get(ITER/'line-continued/feed-fixture-checks.json')
control_feed_checks=get(ITER/'line-controls-thirds/feed-fixture-checks.json')
mesh=(compare_matrices(ITER/'line-continued',ITER/'line-continued')
      if coarse and fine and coarse['complete'] and fine['complete'] else {'complete':False})
studies=[]
for suite,title in [('line-expanded','Larger actual-copper crop'),('line-padding','More distant absorbing boundaries'),
                    ('line-zrefined','Twice the vertical mesh density')]:
    for mode in ['d2','c2']:
        selected='line-padding-long' if suite=='line-padding' and mode=='d2' else suite
        result=compare_case(ITER/selected,.04,mode,ITER/'line-continued')
        studies.append({'name':title,'excitation':mode,**result})
qualified=bool(coarse and coarse['numericallyQualified'] and fine and fine['numericallyQualified']
               and controls.get('passed') and mesh.get('passed') and all(r.get('complete') and r.get('passed') for r in studies)
               and source_comparison and source_comparison['physicalGeometryIdentical'] and source_comparison['routingPassed']
               and model_consistency and all(v['geometryAndProbesMatch'] for v in model_consistency.values())
               and feed_checks and feed_checks['passed'] and control_feed_checks and control_feed_checks['passed'])
result={'localPCB':{'completeMixedModeMatrix':bool(fine and fine['complete']),'qualified':qualified,
          'numericalChecksPassed':bool(coarse and coarse['numericallyQualified'] and fine and fine['numericallyQualified']),
          'scope':'USB4 RX2 connector-side via pair and fanout, nominal lossless PCB model'},
    'coarse':coarse,'fine':fine,'controls':controls,'meshComparison':mesh,'boundaryStudies':studies,
    'currentSourceComparison':source_comparison,'modelConsistency':model_consistency,
    'feedFixtureChecks':feed_checks,'controlFeedFixtureChecks':control_feed_checks,
    'rawMatrixAdjusted':False,'causalityVerified':False,
    'fullChannelVerified':False,'eyeOrBERComputed':False,'firstTryProbabilityRevised':False,
    'physicalLimitations':['Nominal selected stackup; factory thickness, broadband Dk/Df, roughness and via construction remain unconfirmed.',
        'PEC copper and lossless dielectrics isolate local discontinuities. Production attenuation is additional.',
        'Copper crossing the extraction cut continues through the lateral absorber; the remote finite board is outside this model.',
        'Crop, absorber and vertical-mesh tests cover differential and common-mode excitation from the connector side.',
        'Bridge package, component internals, mated connectors, other complete channels and eye/BER are outside this local extraction.'],
    'methodChanges':['Continue laminate and copper edge cross sections through lateral PML, removing the artificial reflective board edge.',
        'Use grid-aligned single-cell feed gaps with explicit dual-grid current faces.',
        'Measure trace voltage and average two surrounding conductor-current planes at separate PCB reference planes.',
        'Validate against an independent 2D control with the exact two-slice copper geometry; enclose the complete conductor in every current contour.',
        'Keep calibration feeds beyond all eight PML cells and use the documented one-third metal-edge meshing rule.']}
if fine and fine['complete']:
    data=np.load(ITER/'line-continued/matrix-0.025.npz');f=data['frequency'];s=data['s_mixed'];se=data['s_single_ended']
    result['localPCB']['atGHz']={str(g):{'differentialInsertionLossDB':float(-20*np.log10(abs(s[np.argmin(abs(f-g*1e9)),0,1]))),
        'connectorSideReturnLossDB':float(-20*np.log10(abs(s[np.argmin(abs(f-g*1e9)),1,1]))),
        'bridgeSideReturnLossDB':float(-20*np.log10(abs(s[np.argmin(abs(f-g*1e9)),0,0])))} for g in [8,10,12]}
    name='USB4_RX2-local-vias-refined.s4p' if qualified else 'USB4_RX2-local-vias-refined-diagnostic.s4p'
    with (OUT/name).open('w') as stream:
        stream.write('! Local nominal PCB model, 1-12 GHz; no package, component or connector internals.\n')
        stream.write('! Qualification and physical assumptions: refined-review.json\n')
        if not qualified:stream.write('! QUALIFICATION PENDING OR FAILED. DIAGNOSTIC USE ONLY.\n')
        stream.write('! Ports 1/2 bottom P/N, 3/4 top P/N. PCB trace V/I reference planes.\n# Hz S RI R 42.5\n')
        for hz,network in zip(f,se):
            for row in range(4):
                stream.write((f'{hz:.12e} ' if row==0 else ' '*19)+' '.join(f'{v.real:.12e} {v.imag:.12e}' for v in network[row])+'\n')
    result['touchstoneFile']=name
    fig,axes=plt.subplots(1,2,figsize=(11,4),layout='constrained')
    for resolution,label in [(.04,'Coarse'),(.025,'Fine')]:
        d=np.load(ITER/f'line-continued/matrix-{resolution:g}.npz');v=d['s_mixed'];ghz=d['frequency']/1e9
        axes[0].plot(ghz,-20*np.log10(abs(v[:,0,1])),label=label)
        axes[1].plot(ghz,-20*np.log10(abs(v[:,1,1])),label=label)
    for ax in axes:ax.set(xlabel='Frequency (GHz)',xlim=(1,12));ax.grid(alpha=.25);ax.legend()
    axes[0].set(ylabel='Local differential insertion loss (dB)');axes[1].set(ylabel='Connector-side return loss (dB)')
    fig.suptitle('USB4 RX2 via pair and fanout — nominal PCB model')
    fig.savefig(OUT/'refined-response.png',dpi=170);plt.close(fig)
(OUT/'refined-review.json').write_text(json.dumps(result,indent=2)+'\n')
e=html.escape
def table(headers,rows):
    return '<table><tr>'+''.join('<th>'+e(str(v))+'</th>' for v in headers)+'</tr>'+''.join('<tr>'+''.join('<td>'+e(str(v))+'</td>' for v in row)+'</tr>' for row in rows)+'</table>'
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flamingo refined extraction</title><style>body{font:16px/1.6 system-ui;color:#173044;background:#f4f7fa}main{max-width:1100px;margin:auto;padding:32px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;text-align:left;border-bottom:1px solid #ddd}img{max-width:100%}.note{background:#fff0d9;border-left:5px solid #b76810;padding:18px}a{color:#065c98}</style><main><h1>Refined 3D extraction</h1>'''
status='The local nominal extraction passes its declared checks.' if qualified else 'Extraction corrections are under validation. Final acceptance remains open.'
page+='<div class="note"><strong>'+status+'</strong><p>This is a local PCB result. Complete channel, assembly and eye/BER verification remain open.</p></div>'
page+='<h2>What changed</h2><ul>'+''.join('<li>'+e(v)+'</li>' for v in result['methodChanges'])+'</ul>'
for label,data in [('Coarse four-port checks',coarse),('Fine four-port checks',fine),('Independent line controls',controls)]:
    page+='<h2>'+label+'</h2>'
    if data and data.get('complete'):
        page+=table(['Check','Measured value','Limit','Result'],[[c['name'],f"{c['value']:.6g}",c['limit'],'PASS' if c['passed'] else 'FAIL'] for c in data['checks']])
    else:page+='<p>Runs remain in progress.</p>'
page+='<h2>Mesh and boundary sensitivity</h2>'
rows=[]
if mesh.get('passed') is not None:rows.append(['Full matrix: XY mesh 0.04 to 0.025 mm',f"{mesh['maximumComplexSChange']:.6g}",f"{mesh['maximumDifferentialILChangeDB']:.4f} dB",'PASS' if mesh['passed'] else 'FAIL'])
for r in studies:
    rows.append([r['name']+' / '+r['excitation'],f"{r['maximumComplexWaveChange']:.6g}" if r.get('complete') else 'Pending',
        f"{r['maximumThroughMagnitudeChangeDB']:.4f} dB" if r.get('complete') else 'Pending',
        ('PASS' if r['passed'] else 'FAIL') if r.get('complete') else 'Pending'])
page+=table(['Comparison','Maximum complex change','Through magnitude change','Result'],rows)
page+='<p>The complex-change limit is 0.025. The differential transmission-magnitude limit is 0.1 dB. Common-mode magnitude changes are informational.</p>'
if fine and fine.get('complete'):
    peak=next(c['value'] for c in fine['checks'] if c['name']=='Full-matrix passivity')
    page+=f'<p>The raw fine matrix has up to {(peak**2-1)*100:.3f}% apparent power excess. It meets the declared 0.5% singular-value tolerance. This residual error is retained; no passivity correction or matrix symmetrization was applied.</p>'
page+='<p>Boundary studies validate individual excitations against the complete reference matrix. The receive direction uses d2 and c2.</p>'
if 'atGHz' in result['localPCB']:
    page+='<h2>Local nominal response</h2>'+table(['Frequency','Differential IL','Connector RL','Bridge RL'],[[g+' GHz',f"{v['differentialInsertionLossDB']:.3f} dB",f"{v['connectorSideReturnLossDB']:.2f} dB",f"{v['bridgeSideReturnLossDB']:.2f} dB"] for g,v in result['localPCB']['atGHz'].items()])
    page+='<img src="refined-response.png" alt="Coarse and fine local differential response">'
page+='<h2>Physical limits</h2><ul>'+''.join('<li>'+e(v)+'</li>' for v in result['physicalLimitations'])+'</ul>'
page+='<p>All checks use raw extracted matrices. No protocol mask or whole-board pass is inferred from these numerical tolerances.</p>'
page+='<p>The four-port file covers 1–12 GHz. Causality and time-domain use are not qualified. Its reference impedance is 42.5 ohms per single-ended port, or 85 ohms differential.</p>'
page+='<p>The prior approximate 50% first-try estimate remains engineering judgment. Local extraction does not calibrate that probability.</p>'
page+='<h2>Evidence</h2><p><a href="refined-review.json">Detailed results</a> · <a href="iterations/control-cross-section-reference.json">Independent control reference</a> · <a href="current-source-comparison.json">Current-source geometry comparison</a> · <a href="reproduction.json">Reproduction commands and source hashes</a> · <a href="../field-solver-handoff.json">Frozen PCB geometry</a> · <a href="legacy-report.html">Original rejected extraction</a> · <a href="../report.html">Overall channel review</a></p>'
if 'touchstoneFile' in result:page+='<p><a href="'+result['touchstoneFile']+'">Local four-port file</a></p>'
page+='<p><a href="https://docs.openems.de/en/latest/concepts/ports.html">openEMS port definitions</a> · <a href="https://docs.openems.de/en/latest/concepts/probes.html">Staggered voltage and current sampling</a></p></main></html>'
if not (OUT/'legacy-report.html').exists():shutil.copyfile(OUT/'report.html',OUT/'legacy-report.html')
(OUT/'report.html').write_text(page)
print(json.dumps({'qualified':qualified,'controlsComplete':controls.get('complete'),'coarseComplete':bool(coarse and coarse['complete']),'fineComplete':bool(fine and fine['complete'])}))
