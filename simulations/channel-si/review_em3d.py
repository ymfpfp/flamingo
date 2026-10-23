"""Check openEMS controls and local transition experiments; render evidence."""
from pathlib import Path
import json
import hashlib
import re
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from openEMS.utilities import DFT_time2freq

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/si-channel-review/em3d'
T=np.array([[1,-1,0,0],[0,0,1,-1],[1,1,0,0],[0,0,1,1]])/np.sqrt(2)
checks=[]

def load(name):
    p=OUT/name
    if not (p/'status.json').exists():return None
    status=json.loads((p/'status.json').read_text())
    if status['state']!='completed':return None
    setup=json.loads((p/'setup.json').read_text())
    assert status['scriptSha256']==setup['scriptSha256']
    assert hashlib.sha256((p/'driver-source.py').read_bytes()).hexdigest()==setup['scriptSha256']
    return {'path':p,'setup':setup,'waves':dict(np.load(p/'waves.npz'))}

def uniform(case,indices=(0,1)):
    w=case['waves'];a=w['am'][:,indices];b=w['bm'][:,indices]
    # Both ends have identical fixtures. Mirror symmetry supplies column two.
    denominator=a[:,0]**2-a[:,1]**2
    r=(a[:,0]*b[:,0]-a[:,1]*b[:,1])/denominator
    t=(a[:,0]*b[:,1]-a[:,1]*b[:,0])/denominator
    return np.array([[r,t],[t,r]]).transpose(2,0,1)

def abcd(s,z=85.):
    r=s[:,0,0];t=s[:,1,0]
    a=(1-r*r+t*t)/(2*t)
    b=z*((1+r)**2-t*t)/(2*t)
    c=((1-r)**2-t*t)/(2*t)/z
    return np.array([[a,b],[c,a]]).transpose(2,0,1)

def db(v):return 20*np.log10(np.maximum(abs(v),1e-15))

def time_response(case,fraction=1.,active=0):
    # Independent time-record comparison uses the solver's own DFT convention.
    p=case['path'];f=case['waves']['frequency'];a=[];b=[]
    for i in range(1,5):
        u=np.loadtxt(p/f'port_ut_{i}',comments='%');v=np.loadtxt(p/f'port_it_{i}',comments='%')
        limit=min(u[-1,0],v[-1,0])*fraction
        u=u[u[:,0]<=limit];v=v[v[:,0]<=limit]
        uf=DFT_time2freq(u[:,0],u[:,1],f)
        vf=DFT_time2freq(v[:,0],v[:,1],f)
        a.append(.5*(uf+42.5*vf));b.append(.5*(uf-42.5*vf))
    am=np.array(a).T@T.T;bm=np.array(b).T@T.T
    return bm/am[:,active,None]

controls=[load(f'control-USB4_RX2-{res:g}-{length:g}-d1')
          for res,length in [(.01,3),(.005,3),(.005,1.5)]]
common_control=load('control-USB4_RX2-0.01-3-c1')
control_report={}
if all(controls):
    medium,fine,short=controls
    f=fine['waves']['frequency'];band=(f>=2e9)&(f<=12e9)
    sm,sf,ss=map(uniform,controls)
    delta=abcd(sf)@np.linalg.inv(abcd(ss))
    eig=np.linalg.eigvals(delta)
    delay=np.max(abs(np.angle(eig)),axis=1)/(2*np.pi*f)
    expected=.0015*np.sqrt(2.9704453)/299792458.
    delay_error=100*(float(np.median(delay[band]))/expected-1)
    il_error=float(np.max(abs(db(sf[band,1,0]))))
    il_mesh=float(np.max(abs(db(sf[band,1,0])-db(sm[band,1,0]))))
    complex_mesh=float(np.max(abs(sf[band]-sm[band])))
    checks += [{'name':'Two-length propagation against independent 2D model',
                'value':delay_error,'unit':'percent error','criterion':'absolute error below 3 percent',
                'passed':abs(delay_error)<3},
               {'name':'PEC uniform-line insertion loss','value':il_error,'unit':'dB',
                'criterion':'absolute insertion loss below 0.05 dB','passed':il_error<.05},
               {'name':'Uniform-line insertion-loss mesh change','value':il_mesh,'unit':'dB',
                'criterion':'below 0.01 dB','passed':il_mesh<.01}]
    control_report={'twoLengthDelayPS':float(np.median(delay[band])*1e12),
        'independentPredictionPS':expected*1e12,'delayErrorPercent':delay_error,
        'maximumComplexSChangeBetweenControlMeshes':complex_mesh,
        'reflectionCaution':'The complex mesh difference sets a numerical warning floor. Low-loss agreement does not establish equally accurate return loss.'}
if common_control:
    fc=common_control['waves']['frequency'];bc=(fc>=1e9)&(fc<=12e9)
    sc=uniform(common_control,(2,3))
    common_error=float(np.max(abs(np.linalg.svd(sc[bc],compute_uv=False)-1)))
    checks.append({'name':'Uniform common-mode lossless energy balance','value':common_error,
        'unit':'maximum singular-value deviation from one','criterion':'below 0.005 over 1–12 GHz',
        'passed':common_error<.005})
    common_time=float(np.max(abs(time_response(common_control,.65,2)[bc]-time_response(common_control,1.,2)[bc])))
    checks.append({'name':'Uniform common-mode time-record sensitivity','value':common_time,
        'unit':'maximum complex wave change','criterion':'below 0.001 over 1–12 GHz',
        'passed':common_time<.001})
    control_report['commonModeEnergyBalanceError']=common_error

cases=[load(f'board-USB4_RX2-0.04-3-{e}') for e in ['d1','d2','c1','c2']]
fine=load('board-USB4_RX2-0.025-3-d1')
board_report={'completeMixedModeMatrix':False,'meshConverged':False,'qualified':False,
    'qualificationScope':'Numerical checks for the local experiment only; no physical channel or production acceptance.'}
curves={}
if cases[0]:
    first=cases[0];f=first['waves']['frequency'];band=(f>=1e9)&(f<=12e9)
    r=first['waves']['response'];curves['coarse']=r
    early=time_response(first,.65);late=time_response(first,1.)
    time_delta=float(np.max(abs(early[band]-late[band])))
    checks.append({'name':'PCB time-record sensitivity','value':time_delta,'unit':'maximum complex wave change',
        'criterion':'below 0.01 over 1–12 GHz','passed':time_delta<.01})
    board_report.update({'sourceSha256':first['setup']['sourceSha256'],
        'scope':first['setup']['scope'],'boundsMm':first['setup']['boundsMm'],
        'assumptions':first['setup']['assumptions'],'timeRecordComplexChange':time_delta,
        'stoppingRule':'Frequency-domain time-record checks govern acceptance. Lossless floating copper can retain energy after the useful pulse response.'})
    if fine:
        rf=fine['waves']['response'];curves['fine']=rf
        fine_time_delta=float(np.max(abs(time_response(fine,.65)[band]-time_response(fine,1.)[band])))
        checks.append({'name':'Fine-mesh PCB time-record sensitivity','value':fine_time_delta,
            'unit':'maximum complex wave change','criterion':'below 0.01 over 1–12 GHz',
            'passed':fine_time_delta<.01})
        il_delta=float(np.max(abs(db(rf[band,1])-db(r[band,1]))))
        s_delta=float(np.max(abs(rf[band]-r[band])))
        passed=il_delta<.1 and s_delta<.025
        checks.append({'name':'PCB mesh sensitivity','value':il_delta,'unit':'maximum insertion-loss change in dB',
            'maximumComplexWaveChange':s_delta,'criterion':'IL change below 0.1 dB and complex wave change below 0.025 over 1–12 GHz',
            'passed':passed})
        board_report.update({'meshConverged':passed,'meshILChangeDB':il_delta,'meshComplexChange':s_delta})
    if all(cases):
        for c in cases[1:]:
            for key in ['sourceSha256','handoffSha256','boundsMm','layerZMm','meshLines','ports']:
                assert c['setup'][key]==first['setup'][key], f'Mismatched matrix geometry: {key}'
            assert np.array_equal(c['waves']['frequency'],f)
        modal_time_changes=[]
        for k,c in enumerate(cases):
            modal_time_changes.append(float(np.max(abs(time_response(c,.65,k)[band]-time_response(c,1.,k)[band]))))
        board_report['timeRecordComplexChangeByExcitation']=dict(zip(['d1','d2','c1','c2'],modal_time_changes))
        modal_time=max(modal_time_changes)
        checks.append({'name':'PCB time-record sensitivity for all four excitations',
            'value':modal_time,'unit':'maximum complex wave change',
            'criterion':'below 0.01 over 1–12 GHz','passed':modal_time<.01})
        aa=[];bb=[]
        for k,c in enumerate(cases):
            w=c['waves'];norm=w['am'][:,k,None]
            aa.append(w['am']/norm);bb.append(w['bm']/norm)
        a=np.stack(aa,axis=2);b=np.stack(bb,axis=2)
        sm=b@np.linalg.inv(a)
        sv=float(np.max(np.linalg.svd(sm[band],compute_uv=False)))
        reciprocity=float(np.max(abs(sm[band]-sm[band].transpose(0,2,1))))
        checks += [{'name':'PCB full-matrix passivity','value':sv,'unit':'maximum singular value',
            'criterion':'below 1.005 over 1–12 GHz','passed':sv<1.005},
            {'name':'PCB full-matrix reciprocity','value':reciprocity,'unit':'maximum complex S difference',
            'criterion':'below 0.01 over 1–12 GHz','passed':reciprocity<.01}]
        se=T.T@sm@T
        np.savez_compressed(OUT/'local-via-matrix.npz',frequency=f,s_single_ended=se,s_mixed=sm)
        # N >= 3 follows row-major order, as in openEMS CTB/write_touchstone.m.
        with (OUT/'USB4_RX2-local-vias-diagnostic.s4p').open('w') as stream:
            stream.write('! Native openEMS local PCB experiment; numerical qualification is in review.json\n')
            if not all(c['passed'] for c in checks):
                stream.write('! NUMERICAL CHECKS FAILED. DO NOT USE FOR DESIGN ACCEPTANCE.\n')
            stream.write('! Not a complete channel or compliance model. PEC and nominal materials.\n')
            stream.write('! Ports 1/2: bottom P/N; ports 3/4: top P/N. Single-ended reference 42.5 ohm.\n')
            stream.write('! Differential reference 85 ohm; common-mode reference 21.25 ohm.\n# Hz S RI R 42.5\n')
            for hz,network in zip(f[band],se[band]):
                for row in range(4):
                    prefix=f'{hz:.12e} ' if row==0 else ' '*19
                    stream.write(prefix+' '.join(f'{v.real:.12e} {v.imag:.12e}' for v in network[row])+'\n')
        board_report['completeMixedModeMatrix']=True
        board_report['atGHz']={str(ghz):{'insertionLossDB':float(-db(sm[np.argmin(abs(f-ghz*1e9)),1,0])),
            'inputReturnLossDB':float(-db(sm[np.argmin(abs(f-ghz*1e9)),0,0])),
            'outputReturnLossDB':float(-db(sm[np.argmin(abs(f-ghz*1e9)),1,1])),
            'differentialToCommonDB':float(db(sm[np.argmin(abs(f-ghz*1e9)),3,0]))}
            for ghz in [8,10,12]}
    else:
        board_report['atGHzDiagnosticOnly']={str(ghz):[float(v) for v in db(r[np.argmin(abs(f-ghz*1e9))])]
                                               for ghz in [8,10,12]}
    board_report['qualified']=bool(all(cases) and fine and all(c['passed'] for c in checks))

for check in checks:check['passed']=bool(check['passed'])
comparison_file=OUT.parent/'current-source-comparison.json'
comparison=json.loads(comparison_file.read_text()) if comparison_file.exists() else None
result={'solver':'openEMS native 3D FDTD','controls':control_report,'checks':checks,'localPCB':board_report,
    'currentSourceComparison':comparison,
    'localPhysicalLimitations':['The cropped-board dimensions have not been varied for domain-size convergence.',
        'Only the input differential excitation has a second PCB mesh. Common-mode and reverse columns use the coarse mesh.',
        'Truncated copper ends and unterminated nearby conductors can affect this local response.'],
    'fullChannelVerified':False,'eyeOrBERComputed':False,'firstTryProbabilityRevised':False,
    'vendorModelAccessAvailable':False,
    'firstTryEstimateContext':'The prior approximate 50 percent estimate remains engineering judgment. These local results do not calibrate or increase it. Power, reset and assembly risks remain open.',
    'remaining':['ASMedia package multiport model and USB4/PCIe TX/RX IBIS-AMI models',
        'Mated multiport models for the exact USB-C and PCIe connectors',
        'Factory-confirmed construction and broadband material data',
        'Remaining BGA/connector/capacitor transitions, adjacent-channel coupling and loaded reference clock',
        'Component models valid through the required USB4/PCIe bandwidth; the recovered capacitor files stop at 6 GHz'],
    'qualification':'Local nominal PCB experiment only. It does not provide a complete assembly or protocol pass.',
    'inputSha256':{str(c['path'].relative_to(ROOT))+'/waves.npz':hashlib.sha256((c['path']/'waves.npz').read_bytes()).hexdigest()
                   for c in controls+cases+[fine,common_control] if c}}
(OUT/'review.json').write_text(json.dumps(result,indent=2)+'\n')
if curves:
    fig,axes=plt.subplots(1,2,figsize=(11,4),layout='constrained')
    for label,r in curves.items():
        axes[0].plot(f/1e9,-db(r[:,1]),label=label)
        axes[1].plot(f/1e9,-db(r[:,0]),label=label)
    for ax in axes:ax.set(xlabel='Frequency (GHz)',xlim=(1,12));ax.grid(alpha=.25);ax.legend()
    axes[0].set(ylabel='Apparent differential insertion loss (dB)')
    axes[1].set(ylabel='Apparent differential return loss (dB)')
    fig.suptitle('USB4 RX2 local via pair — numerical experiment, not assembly compliance')
    fig.savefig(OUT/'local-via-response.png',dpi=170);plt.close(fig)

def table(headers,rows):
    return '<table><tr>'+''.join('<th>'+str(v)+'</th>' for v in headers)+'</tr>'+''.join('<tr>'+''.join('<td>'+str(v)+'</td>' for v in row)+'</tr>' for row in rows)+'</table>'
pending=not(all(cases) and fine)
status=('Experiment runs remain in progress; numerical qualification is pending.' if pending else
        'Local extraction passes the stated numerical checks.' if board_report['qualified'] else
        'Local extraction is not qualified for design acceptance.')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flamingo 3D SI experiment</title>
<style>body{font:16px/1.6 system-ui;color:#173044;background:#f4f7fa}main{max-width:1050px;margin:auto;padding:30px}table{border-collapse:collapse;width:100%;background:white}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}img{max-width:100%}.note{background:#fff0d9;border-left:5px solid #b76810;padding:18px}a{color:#065c98}code{overflow-wrap:anywhere}</style><main><h1>3D signal-integrity experiment</h1>'''
page+=f'<div class="note"><strong>{status}</strong><p>Complete USB4/PCIe channel qualification remains open. No eye, BER or first-try probability improvement is claimed.</p></div>'
if not pending and not board_report['qualified']:
    page+='<p class="note">Failed numerical checks reject this local matrix for design acceptance. They do not establish a physical board failure.</p>'
    page+='<p>Common-mode ringing requires further domain, material-loss and time-record studies. Adding arbitrary damping would not validate the production board.</p>'
page+='<p>The native openEMS solver runs a three-dimensional FDTD model. The uniform-line controls compare propagation against the independent 2D solver.</p>'
page+='<p>The PCB experiment covers the connector-side USB4 RX2 via pair and its fanout. It includes exported nearby copper, plane apertures and vias.</p>'
page+='<p>The bridge package, the BGA launch, component internals and the mated USB-C connector remain outside this local model.</p>'
if comparison:
    unchanged=all(v['identical'] for v in comparison['physicalGeometry'].values())
    page+=('<p>A fresh source build matches every simulated board, trace, via, pad, hole and copper-pour object. '
           'The USB4, PCIe TX, PCIe RX and clock geometry audits also pass.</p>' if unchanged and all(comparison['auditPass'].values()) else
           '<p class="note">The latest source comparison requires review. The simulation applies only to its frozen geometry.</p>')
page+='<h2>Numerical checks</h2>'+table(['Check','Value','Criterion','Result'],[[c['name'],f"{c['value']:.6g} {c['unit']}",c['criterion'],'PASS' if c['passed'] else 'OPEN / FAIL'] for c in checks])
page+='<p>A numerical pass checks this experiment. It does not certify the complete board or validate unknown manufacturing parameters.</p>'
page+='<p>The PCB runs use a frequency-domain time-record check. Lossless floating copper can retain energy after the useful pulse response.</p>'
page+='<p>The global energy-decay target alone does not determine acceptance. The report compares shorter and longer time records directly.</p>'
if control_report:page+=f"<p>The two-length delay is {control_report['twoLengthDelayPS']:.3f} ps. The independent prediction is {control_report['independentPredictionPS']:.3f} ps.</p>"
if 'atGHz' in board_report:
    page+=('<h2>Local nominal response</h2>' if board_report['qualified'] else '<h2>Local diagnostic response — unqualified</h2>')+table(['Frequency','IL','Input RL','Output RL','Differential to common'],[[k+' GHz',f"{v['insertionLossDB']:.3f} dB",f"{v['inputReturnLossDB']:.2f} dB",f"{v['outputReturnLossDB']:.2f} dB",f"{v['differentialToCommonDB']:.2f} dB"] for k,v in board_report['atGHz'].items()])
    page+='<p>Use these values only with the stated numerical qualification. This lossless-metal model does not determine actual production attenuation.</p>'
if curves:page+='<img src="local-via-response.png" alt="Local via response and mesh sensitivity">'
page+='<h2>Physical assumptions</h2><ul>'+''.join('<li>'+s+'</li>' for s in board_report.get('assumptions',[]))+'</ul>'
page+='<p>Some tiny geometry primitives can be unused after meshing. Mesh convergence, terminal checks and the full matrix checks determine acceptance.</p>'
page+='<h2>Local physical limits</h2><ul>'+''.join('<li>'+s+'</li>' for s in result['localPhysicalLimitations'])+'</ul>'
page+='<p>These limits restrict the result to a numerical screening experiment. They prevent production-channel acceptance from this local result alone.</p>'
page+='<h2>Remaining work</h2><ul>'+''.join('<li>'+s+'</li>' for s in result['remaining'])+'</ul>'
page+='<p>The user confirmed that vendor model access is unavailable. Complete assembly qualification therefore remains blocked by those files.</p>'
page+='<p>'+result['firstTryEstimateContext']+'</p>'
page+='<p>The public exact Murata TX and Samsung capacitor models end at 6 GHz. The Samsung file now supplies complex phase within that band.</p>'
page+='<p>No public exact package/PHY or connector files were retrieved. A vendor-data checklist is prepared; no supplier messages were sent.</p>'
page+='<h2>Evidence</h2><p><a href="review.json">Results and hashes</a> · <a href="environment.json">Solver build record</a> · <a href="../field-solver-handoff.json">Frozen PCB geometry</a> · <a href="../current-source-comparison.json">Current source comparison</a> · <a href="../report.html">Overall channel screen</a></p>'
if all(cases):page+='<p><a href="USB4_RX2-local-vias-diagnostic.s4p">Local four-port Touchstone file</a> · <a href="local-via-matrix.npz">Single-ended and mixed-mode matrices</a></p>'
page+='<h2>How to repeat this experiment</h2><p>Use the native solver versions in the build record. Run commands from the repository root with that Python environment.</p>'
page+='<pre><code>python simulations/channel-si/em3d.py --case control --resolution .005 --length 3 --engine gpu\npython simulations/channel-si/em3d.py --case board --resolution .04 --excitation d1 --engine gpu\npython simulations/channel-si/review_em3d.py</code></pre>'
page+='<p>The complete set also uses control meshes of 0.01 and 0.005 mm, with control lengths of 3 and 1.5 mm.</p>'
page+='<p>A 0.01 mm common-mode control independently checks passive energy balance for the common-mode port setup.</p>'
page+='<p>The PCB set uses four excitations at 0.04 mm, plus the input differential excitation at 0.025 mm. The model files record the exact nonuniform mesh.</p>'
page+='<p>Initial trials with inadequate absorbing-layer spacing or omitted signal-via lands are rejected. Their files remain under rejected-trials for audit.</p>'
page+='<img src="material-slices.png" alt="Imported top, reference-plane and bottom copper with intact signal-via lands">'
page+='<p><a href="https://docs.openems.de/en/latest/install/clone-build-install.html">Official solver build instructions</a> · <a href="https://docs.openems.de/en/latest/concepts/ports.html">Port definitions and limitations</a> · <a href="https://weblib.samsungsem.com/mlcc/mlcc-ec.do?partNumber=CL05B224KO5NNN">Samsung model source</a></p></main></html>'
(OUT/'report.html').write_text(page)
print(json.dumps({'checks':checks,'localPCB':board_report},indent=2))
