"""Apply the original numerical and sensitivity limits to each channel."""
from pathlib import Path
import hashlib,json,os,xml.etree.ElementTree as ET
import numpy as np
from analyze_extraction import read_case,waves,matrix,F,T
from audit_feed_fixtures import inspect as inspect_feed

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review/all-channels'
MODES=['d1','d2','c1','c2']
def case_path(suite,channel,res,mode):return OUT/suite/f'board-{channel}-{res:g}-3-{mode}'
def hashes(path):
    names=['setup.json','model.xml','driver-source.py','base-driver-source.py','em3d-source.py','em3d-line-source.py','fixed-feed-source.py','feature-mesh-source.py','waves.npz','feed-waves.npz']
    names += [f'port_{kind}_{i}' for i in range(1,5) for kind in ['ut','it']]
    setup=json.loads((path/'setup.json').read_text())
    for spec in setup['lineMeasurement']:names += [spec['voltageFilename']]+spec['currentFilenames']
    return {str(path/n):hashlib.sha256((path/n).read_bytes()).hexdigest() for n in names if (path/n).exists()}
def complete(path):
    return (path/'status.json').exists() and json.loads((path/'status.json').read_text())['state']=='completed'

def functional_model_hash(path):
    root=ET.parse(path/'model.xml').getroot().find('ContinuousStructure');properties=root.find('Properties')
    for element in list(properties):
        if element.tag=='Excitation':properties.remove(element)
    for element in root.iter():
        element.attrib.pop('ID',None)
        for child in list(element):
            if child.tag in ['FillColor','EdgeColor']:element.remove(child)
    return hashlib.sha256(ET.tostring(root)).hexdigest()

def inspect(channel,suite,res,paths=None):
    paths=paths if paths is not None else [case_path(suite,channel,res,m) for m in MODES]
    if not all(complete(p) for p in paths):return {'complete':False,'completedModes':[m for p,m in zip(paths,MODES) if complete(p)]}
    cases=[read_case(p) for p in paths]
    for c in cases[1:]:
        for key in ['meshLines','ports','terminalGaps','lineMeasurement','boundsMm','layerZMm']:
            assert c['setup'][key]==cases[0]['setup'][key],(channel,key)
    model_hashes=[functional_model_hash(p) for p in paths]
    assert len(set(model_hashes))==1,(channel,'functional model changed across excitations')
    s,condition=matrix(cases);time_change=max(float(np.max(abs(matrix(cases,f)[0]-s))) for f in [.65,.8])
    singular=float(np.linalg.svd(s,compute_uv=False).max());reciprocity=float(abs(s-s.transpose(0,2,1)).max())
    feeds=[inspect_feed(p) for p in paths]
    checks=[{'name':'Time-record sensitivity','value':time_change,'limit':.01,'passed':time_change<.01},
        {'name':'Passivity','value':singular,'limit':1.005,'passed':singular<1.005},
        {'name':'Reciprocity','value':reciprocity,'limit':.01,'passed':reciprocity<.01},
        {'name':'Incident-matrix conditioning','value':condition,'limit':10,'passed':condition<10},
        {'name':'Passive feed-load residual','value':max(f['passiveGapIncidentToReflectedRatio'] for f in feeds),'limit':.01,'passed':all(f['passed'] for f in feeds)}]
    nyquist=10 if channel.startswith('USB') else 8;index=np.argmin(abs(F-nyquist*1e9))
    response={'frequencyGHz':nyquist,'differentialInsertionLossDB':float(-20*np.log10(abs(s[index,1,0]))),
        'inputReturnLossDB':float(-20*np.log10(abs(s[index,0,0]))),'outputReturnLossDB':float(-20*np.log10(abs(s[index,1,1]))),
        'differentialToCommonDB':float(20*np.log10(max(abs(s[index,3,0]),1e-15))),
        'reverseDifferentialToCommonDB':float(20*np.log10(max(abs(s[index,2,1]),1e-15))),
        'worstThroughDifferentialToCommonDB':float(20*np.log10(max(abs(s[index,3,0]),abs(s[index,2,1]),1e-15)))}
    target=OUT/suite/f'{channel}-matrix.npz';temp=target.with_name(target.stem+f'.{os.getpid()}.tmp.npz')
    np.savez_compressed(temp,frequency=F,s_mixed=s,s_single_ended=T.T@s@T);temp.replace(target)
    result={'complete':True,'passed':all(c['passed'] for c in checks),'checks':checks,'atNyquist':response,'functionalModelHashes':model_hashes,
        'maximumApparentPowerExcessPercent':max(0,(singular**2-1)*100),'feedFixtureChecks':feeds,'inputSha256':{k:v for p in paths for k,v in hashes(p).items()},
        'recordLengthNS':{m:float(c['records'][0][0][-1,0]*1e9) for m,c in zip(MODES,cases)}}
    (OUT/suite/f'{channel}-checks.json').write_text(json.dumps(result,indent=2)+'\n');return result

def mesh_change(channel):
    paths=[OUT/s/f'{channel}-matrix.npz' for s in ['coarse','fine']]
    if not all(p.exists() for p in paths):return {'complete':False}
    a,b=[np.load(p)['s_mixed'] for p in paths];difference=abs(a-b);change=float(difference.max())
    worst=np.unravel_index(difference.argmax(),difference.shape);first=a[worst];second=b[worst]
    il=max(float(np.max(abs(20*np.log10(abs(b[:,i,j]/a[:,i,j]))))) for i,j in [(0,1),(1,0)])
    nyquist=10 if channel.startswith('USB') else 8
    return {'complete':True,'maximumComplexChange':change,'maximumDifferentialILChangeDB':il,'passed':change<.025 and il<.1,
        'worstFrequencyGHz':float(F[worst[0]]/1e9),'worstOutgoingMode':MODES[worst[1]],'worstIncomingMode':MODES[worst[2]],
        'phaseChangeAtWorstDegrees':float(np.angle(second/first,deg=True)) if abs(first)>.1 and abs(second)>.1 else None,
        'maximumComplexChangeThroughNyquist':float(difference[F<=nyquist*1e9].max()),
        'limits':{'maximumComplexChange':.025,'maximumDifferentialILChangeDB':.1}}

def study(channel,suite,mode,resolution=.04,path=None,baseline_suite='coarse'):
    path=Path(path) if path is not None else case_path(suite,channel,resolution,mode);baseline=OUT/baseline_suite/f'{channel}-matrix.npz'
    if not complete(path) or not baseline.exists():return {'complete':False,'suite':suite,'mode':mode}
    case=read_case(path);s=np.load(baseline)['s_mixed'];a,b=waves(case);k=MODES.index(mode);pred=np.einsum('fij,fj->fi',s,a)
    change=float(abs((b-pred)/a[:,k,None]).max());opposite=[1,0,3,2][k]
    magnitude=float(np.max(abs(20*np.log10(abs(b[:,opposite]/pred[:,opposite])))))
    time_change=0.
    for fraction in [.65,.8]:
        aa,bb=waves(case,fraction);time_change=max(time_change,float(abs(bb/aa[:,k,None]-b/a[:,k,None]).max()))
    feed=inspect_feed(path);sensitivity=change<.025 and (k>=2 or magnitude<.1) and time_change<.01
    return {'complete':True,'suite':suite,'mode':mode,'baselineSuite':baseline_suite,'maximumComplexChange':change,'throughMagnitudeChangeDB':magnitude,
        'timeRecordSensitivity':time_change,'responseSensitivityPassed':sensitivity,'feedFixture':feed,
        'passed':bool(sensitivity and feed['passed']),'inputSha256':hashes(path)}

def review():
    plan=json.loads((OUT/'plan.json').read_text());results=[]
    calibration_path=ROOT/'dist/si-channel-review/em3d/refined-review.json'
    calibration=json.loads(calibration_path.read_text())['controls']
    rotation=json.loads((OUT/'rotation-check.json').read_text()) if (OUT/'rotation-check.json').exists() else {'complete':False,'passed':False}
    for p in plan['plans']:
        if not p['supported'] or p.get('priorReferenceOnly'):continue
        name=p['channel'];phase_results=[]
        for suite,res in [('coarse',.04),('fine',.025)]:
            try:phase_results.append(inspect(name,suite,res))
            except (AssertionError,np.linalg.LinAlgError,ValueError) as error:
                phase_results.append({'complete':True,'passed':False,'checks':[],'analysisError':str(error)})
        coarse,fine=phase_results
        studies=[study(name,s,m) for s in ['crop','padding','vertical','mask'] for m in ['d2','c2']];mesh=mesh_change(name)
        passed=coarse.get('passed') and fine.get('passed') and mesh.get('passed') and all(s.get('passed') for s in studies) and calibration['passed'] and rotation['passed']
        results.append({'channel':name,'scope':p['kind'],'coarse':coarse,'fine':fine,'mesh':mesh,'studies':studies,'allExtractionChecksPassed':bool(passed)})
    result={'sourceSha256':plan['sourceSha256'],'frequencyBandGHz':[1,12],'channels':results,
        'allExtractionChecksPassed':all(c['allExtractionChecksPassed'] for c in results),'fullChannelVerified':False,'eyeOrBERComputed':False,
        'scope':'Comparable local PCB transitions and fanout only; nominal lossless material model.',
        'calibration':calibration,'rotationCalibration':rotation,
        'analyzerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps([{'channel':c['channel'],'coarseComplete':c['coarse']['complete'],'coarsePassed':c['coarse'].get('passed'),
        'fineComplete':c['fine']['complete'],'finePassed':c['fine'].get('passed'),'meshPassed':c['mesh'].get('passed'),'allPassed':c['allExtractionChecksPassed']} for c in results],indent=2))
    return result
if __name__=='__main__':review()
