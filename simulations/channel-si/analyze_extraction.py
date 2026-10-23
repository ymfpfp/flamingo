"""Independent four-port, time-record and native probe checks for a suite."""
from pathlib import Path
import argparse,hashlib,json,re
import numpy as np
from openEMS.utilities import DFT_time2freq

F=np.linspace(1e9,12e9,177)
T=np.array([[1,-1,0,0],[0,0,1,-1],[1,1,0,0],[0,0,1,1]])/np.sqrt(2)

def read_case(path):
    setup=json.loads((path/'setup.json').read_text())
    status=json.loads((path/'status.json').read_text())
    assert hashlib.sha256((path/'driver-source.py').read_bytes()).hexdigest()==setup['scriptSha256']
    if 'baseSourceSha256' in setup:
        assert hashlib.sha256((path/'base-driver-source.py').read_bytes()).hexdigest()==setup['baseSourceSha256']
    records=[];probe_checks=[]
    for i in range(1,5):
        current=path/f'port_it_{i}'
        expected=setup.get('terminalGaps',[{}]*4)[i-1].get('expectedCurrentIndices')
        if expected:
            headers=current.read_text().splitlines()[:4]
            actual=[[int(n) for n in re.search(r'\[([^]]+)\]',line).group(1).split(',')]
                    for line in headers if '-coordinates:' in line]
            assert actual==expected,(path.name,i,actual,expected)
            probe_checks.append({'port':i,'expected':expected,'actual':actual,'passed':True})
        if setup.get('measurementStyle')=='line':
            spec=setup['lineMeasurement'][i-1]
            u=np.loadtxt(path/spec['voltageFilename'],comments='%',ndmin=2)
            currents=[np.loadtxt(path/f,comments='%',ndmin=2) for f in spec['currentFilenames']]
            if status['state']=='completed':assert len(currents[0])==len(currents[1])
            length=min(map(len,currents));currents=[c[:length] for c in currents]
            assert np.array_equal(currents[0][:,0],currents[1][:,0])
            v=currents[0].copy();v[:,1]=sum(w*c[:,1] for w,c in zip(spec['currentWeights'],currents))
            for filename,expected in zip(spec['currentFilenames'],spec['expectedCurrentIndices']):
                headers=(path/filename).read_text().splitlines()[:4]
                actual=[[int(n) for n in re.search(r'\[([^]]+)\]',line).group(1).split(',')]
                        for line in headers if '-coordinates:' in line]
                assert actual==expected,(filename,actual,expected)
                probe_checks.append({'file':filename,'expected':expected,'actual':actual,'passed':True})
        else:
            u=np.loadtxt(path/f'port_ut_{i}',comments='%',ndmin=2)
            v=np.loadtxt(current,comments='%',ndmin=2)
        records.append((u,v))
    return {'path':path,'setup':setup,'status':status,'records':records,'probeChecks':probe_checks}

def waves(case,fraction=1):
    u=[];i=[]
    end=min(min(a[-1,0],b[-1,0]) for a,b in case['records'])
    for a,b in case['records']:
        if fraction<1:
            a=a[a[:,0]<=end*fraction];b=b[b[:,0]<=end*fraction]
        u.append(DFT_time2freq(a[:,0],a[:,1],F))
        i.append(DFT_time2freq(b[:,0],b[:,1],F))
    a=(np.array(u).T+42.5*np.array(i).T)/2@T.T
    b=(np.array(u).T-42.5*np.array(i).T)/2@T.T
    if fraction==1 and case['status']['state']=='completed':
        native=np.load(case['path']/'waves.npz');band=(native['frequency']>=1e9)&(native['frequency']<=12e9)
        assert np.array_equal(native['frequency'][band],F)
        assert np.allclose(a,native['am'][band],rtol=1e-10,atol=1e-25)
        assert np.allclose(b,native['bm'][band],rtol=1e-10,atol=1e-25)
    return a,b

def matrix(cases,fraction=1):
    aa=[];bb=[]
    for k,c in enumerate(cases):
        a,b=waves(c,fraction);norm=a[:,k,None]
        aa.append(a/norm);bb.append(b/norm)
    a=np.stack(aa,axis=2);b=np.stack(bb,axis=2)
    return b@np.linalg.inv(a),float(np.max(np.linalg.cond(a)))

def inspect(suite,resolution=.04,case_type='board'):
    cases=[]
    for mode in ['d1','d2','c1','c2']:
        path=suite/f'{case_type}-USB4_RX2-{resolution:g}-3-{mode}'
        if not (path/'port_it_4').exists():return {'complete':False,'pendingMode':mode}
        cases.append(read_case(path))
    for c in cases[1:]:
        for key in ['meshLines','ports','terminalGaps','lineMeasurement','boundsMm','layerZMm','lateralBoundary']:
            if key in cases[0]['setup']:assert c['setup'][key]==cases[0]['setup'][key],key
    full,condition=matrix(cases)
    changes=[float(np.max(abs(matrix(cases,frac)[0]-full))) for frac in [.65,.8]]
    sv=np.linalg.svd(full,compute_uv=False)
    reciprocity=abs(full-full.transpose(0,2,1))
    checks=[{'name':'Full-matrix time-record sensitivity','value':max(changes),'limit':.01,'passed':max(changes)<.01},
            {'name':'Full-matrix passivity','value':float(sv.max()),'limit':1.005,'passed':sv.max()<1.005},
            {'name':'Full-matrix reciprocity','value':float(reciprocity.max()),'limit':.01,'passed':reciprocity.max()<.01}]
    checks.append({'name':'Incident-matrix conditioning','value':condition,'limit':10,'passed':condition<10})
    completed=all(c['status']['state']=='completed' for c in cases)
    result={'complete':completed,'numericallyQualified':bool(completed and all(c['passed'] for c in checks)),
        'measurementStyle':cases[0]['setup'].get('measurementStyle','feed'),
        'sourceSha256':cases[0]['setup'].get('sourceSha256'),
        'boundsMm':cases[0]['setup'].get('boundsMm'),
        'qualificationScope':'Numerical checks only; mesh, domain and fixture sensitivity must be checked separately.',
        'analyzerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'frequencyBandGHz':[1,12],'checks':checks,'incidentMatrixConditionNumber':condition,
        'worstPassivityGHz':float(F[np.unravel_index(sv.argmax(),sv.shape)[0]]/1e9),
        'worstReciprocityGHz':float(F[np.unravel_index(reciprocity.argmax(),reciprocity.shape)[0]]/1e9),
        'recordLengthNS':{c['setup']['excitation']:float(c['records'][0][0][-1,0]*1e9) for c in cases},
        'probeChecks':{c['setup']['excitation']:c['probeChecks'] for c in cases},
        'inputSha256':{str(c['path']/'driver-source.py'):c['setup']['scriptSha256'] for c in cases}}
    if completed:
        for c in cases:
            filenames=['setup.json','model.xml','waves.npz']
            filenames += [f'port_{kind}_{i}' for i in range(1,5) for kind in ['ut','it']]
            if 'baseSourceSha256' in c['setup']:filenames.append('base-driver-source.py')
            for spec in c['setup'].get('lineMeasurement',[]):
                filenames += [spec['voltageFilename']]+spec['currentFilenames']
            for name in filenames:
                file=c['path']/name
                result['inputSha256'][str(file)]=hashlib.sha256(file.read_bytes()).hexdigest()
    np.savez_compressed(suite/f'matrix-{resolution:g}.npz',frequency=F,s_mixed=full,s_single_ended=T.T@full@T)
    (suite/f'checks-{resolution:g}.json').write_text(json.dumps(result,indent=2,default=lambda v:bool(v))+'\n')
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('suite',type=Path)
    p.add_argument('--resolution',type=float,default=.04);p.add_argument('--case-type',default='board')
    args=p.parse_args();result=inspect(args.suite,args.resolution,args.case_type)
    print(json.dumps({k:v for k,v in result.items() if k not in ['inputSha256','probeChecks']},indent=2,default=lambda v:bool(v)))
