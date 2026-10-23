"""Independent line controls and physical-sensitivity comparisons."""
from pathlib import Path
import argparse,hashlib,json
import numpy as np
from analyze_extraction import read_case,waves,F

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/si-channel-review/em3d/iterations'

def uniform(case,mode=0,fraction=1):
    a,b=waves(case,fraction);a=a[:,mode:mode+2];b=b[:,mode:mode+2]
    den=a[:,0]**2-a[:,1]**2
    r=(a[:,0]*b[:,0]-a[:,1]*b[:,1])/den
    t=(a[:,0]*b[:,1]-a[:,1]*b[:,0])/den
    return np.array([[r,t],[t,r]]).transpose(2,0,1)

def abcd(s):
    r=s[:,0,0];t=s[:,1,0]
    a=(1-r*r+t*t)/(2*t);b=85*((1+r)**2-t*t)/(2*t);c=((1-r)**2-t*t)/(2*t)/85
    return np.array([[a,b],[c,a]]).transpose(2,0,1)

def line_controls(suite=None,reference_file=None,expected_control_height_mm=None,expected_binding=None):
    suite=Path(suite) if suite else OUT/'line-controls-thirds'
    legacy_suites=[OUT/'line-controls-thirds',ROOT/'dist/si-channel-review/refined-channels/controls']
    refpath=Path(reference_file) if reference_file else (OUT/'control-cross-section-reference.json' if suite.resolve() in [p.resolve() for p in legacy_suites] else suite.parent/'control-cross-section-reference.json')
    paths=[suite/'control-USB4_RX2-0.01-3-d1',suite/'control-USB4_RX2-0.005-3-d1',
           suite/'control-USB4_RX2-0.005-1.5-d1',suite/'control-USB4_RX2-0.01-3-c1']
    pending=[str(p) for p in paths if not ((p/'waves.npz').exists() and (p/'status.json').exists() and json.loads((p/'status.json').read_text())['state']=='completed')]
    if pending or not refpath.exists():
        return {'complete':False,'pending':pending,'referenceFile':str(refpath),'referencePending':not refpath.exists()}
    medium,fine,short,common=[read_case(p) for p in paths]
    reference=json.loads(refpath.read_text())
    if expected_control_height_mm is not None:
        assert all(abs(case['inputs']['height']-expected_control_height_mm)<1e-12 for case in reference['cases']),'Independent reference has wrong control height'
        for case in [medium,fine,short,common]:
            assert abs(case['setup']['controlHeightMm']-expected_control_height_mm)<1e-12,(str(case['path']),'Native control has wrong height')
    if expected_binding is not None:
        for key in ['sourceSha256','handoffSha256','stackupSha256']:
            assert reference['inputBinding'][key]==expected_binding[key],('Independent reference binding mismatch',key)
        for case in [medium,fine,short,common]:
            for key in ['sourceSha256','handoffSha256']:
                assert case['setup'][key]==expected_binding[key],(str(case['path']),'Native control binding mismatch',key)
    exact=reference['cases'][-1]
    sm,sf,ss=map(uniform,[medium,fine,short]);sc=uniform(common,2)
    eig=np.linalg.eigvals(abcd(sf)@np.linalg.inv(abcd(ss)))
    band=F>=2e9;delay=np.median(np.max(abs(np.angle(eig[band])),axis=1)/(2*np.pi*F[band]))
    expected=.0015*np.sqrt(exact['effective_er'])/299792458
    delay_error=float(abs(delay/expected-1)*100)
    il=lambda s:-20*np.log10(abs(s[:,1,0]))
    il_error=float(np.max(abs(il(sf))));il_mesh=float(np.max(abs(il(sf)-il(sm))))
    z=exact['impedance_ohm']/85;theta=2*np.pi*F*.003*np.sqrt(exact['effective_er'])/299792458
    denominator=np.cos(theta)+.5j*(z+1/z)*np.sin(theta)
    exact_r=.5j*(z-1/z)*np.sin(theta)/denominator
    reflection=float(np.max(abs(sf[:,0,0]-exact_r)))
    common_error=float(np.max(abs(np.linalg.svd(sc,compute_uv=False)-1)))
    common_time=max(float(np.max(abs(uniform(common,2,fraction)-sc))) for fraction in [.65,.8])
    checks=[{'name':'Independent 2D reference mesh sensitivity','value':reference['relativeImpedanceMeshChange'],'limit':.005,'unit':'relative impedance','passed':reference['relativeImpedanceMeshChange']<.005},
            {'name':'Two-length propagation against independent 2D model','value':delay_error,'limit':3,'unit':'percent','passed':delay_error<3},
            {'name':'Uniform-line insertion loss','value':il_error,'limit':.05,'unit':'dB','passed':il_error<.05},
            {'name':'Uniform-line insertion-loss mesh sensitivity','value':il_mesh,'limit':.01,'unit':'dB','passed':il_mesh<.01},
            {'name':'Reflection against independent line model','value':reflection,'limit':.01,'unit':'complex amplitude','passed':reflection<.01},
            {'name':'Common-mode lossless energy balance','value':common_error,'limit':.005,'unit':'singular-value deviation','passed':common_error<.005},
            {'name':'Common-mode time-record sensitivity','value':common_time,'limit':.001,'unit':'complex amplitude','passed':common_time<.001}]
    hashes={}
    for path in paths:
        names=['setup.json','model.xml','driver-source.py','base-driver-source.py','waves.npz']
        names += [f'port_{kind}_{i}' for i in range(1,5) for kind in ['ut','it']]
        for spec in json.loads((path/'setup.json').read_text())['lineMeasurement']:
            names += [spec['voltageFilename']]+spec['currentFilenames']
        for name in names:hashes[str(path/name)]=hashlib.sha256((path/name).read_bytes()).hexdigest()
    hashes[str(refpath)]=hashlib.sha256(refpath.read_bytes()).hexdigest()
    return {'complete':True,'passed':all(c['passed'] for c in checks),'checks':checks,
        'delayPS':float(delay*1e12),'expectedDelayPS':float(expected*1e12),'cases':[str(p) for p in paths],
        'referenceFile':str(refpath),'controlHeightMm':expected_control_height_mm,'inputBinding':expected_binding,
        'inputSha256':hashes,'analyzerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

def compare_case(suite,res,mode,reference_suite,reference_res=.04):
    path=suite/f'board-USB4_RX2-{res:g}-3-{mode}'
    if not (path/'waves.npz').exists():return {'complete':False,'case':str(path)}
    c=read_case(path);k=['d1','d2','c1','c2'].index(mode)
    baseline=np.load(reference_suite/f'matrix-{reference_res:g}.npz')['s_mixed']
    a,b=waves(c);prediction=np.einsum('fij,fj->fi',baseline,a)
    delta=(b-prediction)/a[:,k,None]
    time_change=0.
    for fraction in [.65,.8]:
        aa,bb=waves(c,fraction)
        time_change=max(time_change,float(np.max(abs(bb/aa[:,k,None]-b/a[:,k,None]))))
    opposite=[1,0,3,2][k]
    magnitude=float(np.max(abs(20*np.log10(abs(b[:,opposite]/prediction[:,opposite])))))
    maximum=float(np.max(abs(delta)))
    hashes={}
    if c['status']['state']=='completed':
        names=['setup.json','model.xml','driver-source.py','base-driver-source.py','waves.npz']
        names += [f'port_{kind}_{i}' for i in range(1,5) for kind in ['ut','it']]
        for spec in c['setup']['lineMeasurement']:
            names += [spec['voltageFilename']]+spec['currentFilenames']
        for name in names:hashes[str(path/name)]=hashlib.sha256((path/name).read_bytes()).hexdigest()
        refpath=reference_suite/f'matrix-{reference_res:g}.npz'
        hashes[str(refpath)]=hashlib.sha256(refpath.read_bytes()).hexdigest()
    return {'complete':c['status']['state']=='completed','case':str(path),'referenceSuite':str(reference_suite),
        'comparisonType':'Single-excitation validation against the complete reference matrix',
        'maximumComplexWaveChange':maximum,'maximumThroughMagnitudeChangeDB':magnitude,
        'timeRecordSensitivity':time_change,
        'passed':bool(maximum<.025 and (k>=2 or magnitude<.1) and time_change<.01),
        'limits':{'maximumComplexWaveChange':.025,'maximumDifferentialThroughMagnitudeChangeDB':.1,'timeRecordSensitivity':.01},
        'magnitudeCriterionApplies':k<2,'inputSha256':hashes}

def compare_matrices(reference_suite,other_suite,reference_res=.04,other_res=.025):
    a=np.load(reference_suite/f'matrix-{reference_res:g}.npz')['s_mixed']
    b=np.load(other_suite/f'matrix-{other_res:g}.npz')['s_mixed']
    diff=float(np.max(abs(a-b)))
    il=max(float(np.max(abs(20*np.log10(abs(b[:,i,j]/a[:,i,j]))))) for i,j in [(1,0),(0,1)])
    return {'comparisonType':'Complete four-port matrices','maximumComplexSChange':diff,'maximumDifferentialILChangeDB':il,
        'passed':bool(diff<.025 and il<.1),'limits':{'maximumComplexSChange':.025,'maximumDifferentialILChangeDB':.1}}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--controls',action='store_true')
    p.add_argument('--suite',type=Path);p.add_argument('--reference-file',type=Path)
    p.add_argument('--control-height-mm',type=float);p.add_argument('--output-file',type=Path);args=p.parse_args()
    if args.controls:
        result=line_controls(args.suite,args.reference_file,args.control_height_mm)
        (args.output_file or OUT/'line-controls-review.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({k:v for k,v in result.items() if k!='inputSha256'},indent=2))
