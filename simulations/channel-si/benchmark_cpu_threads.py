"""Compare CPU thread settings with a frozen, completed native field case.

Production jobs keep running. A live reservation leaves one worker slot for
these serial trials and expires automatically if the benchmark disappears.
Benchmark outputs never count as channel qualification.
"""
from pathlib import Path
import argparse,hashlib,json,os,re,resource,shutil,subprocess,sys,time,signal
import xml.etree.ElementTree as ET
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
CAMPAIGN=ROOT/'dist/si-channel-review/refined-channels'
OUT=ROOT/'dist/si-channel-review/cpu-thread-benchmark'
REFERENCE=CAMPAIGN/'coarse/board-PCIE_RX3-0.025-3-d1'
LIMIT=1e-10

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path,value):
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value,indent=2)+'\n');temporary.replace(path)

def model_hash(path):
    tree=ET.parse(path).getroot()
    tree.find('FDTD').set('NumberOfTimesteps','matched-record')
    for element in tree.iter():
        element.attrib.pop('ID',None)
        for child in list(element):
            if child.tag in ['FillColor','EdgeColor']:element.remove(child)
    return hashlib.sha256(ET.tostring(tree)).hexdigest()

def prepare():
    assert json.loads((REFERENCE/'status.json').read_text())['state']=='completed'
    OUT.mkdir(parents=True,exist_ok=True);sources=OUT/'frozen-sources';sources.mkdir(exist_ok=True)
    for source,destination in [('driver-source.py','batch_em3d.py'),('base-driver-source.py','batch_geometry.py'),
            ('em3d-source.py','em3d.py'),('em3d-line-source.py','em3d_line.py'),
            ('fixed-feed-source.py','fixed_feed.py'),('feature-mesh-source.py','feature_mesh.py')]:
        shutil.copyfile(REFERENCE/source,sources/destination)
    shutil.copyfile(ROOT/'simulations/pcie-tx/copper_geometry.py',sources/'copper_geometry.py')
    setup=json.loads((REFERENCE/'setup.json').read_text())
    save(OUT/'frozen-plan.json',{'plans':[setup['regionPlan']]})
    steps=int(re.search(r'Time for (\d+) iterations', (REFERENCE/'solver.log').read_text())[1])
    save(OUT/'inputs.json',{'reference':str(REFERENCE),'steps':steps,'comparisonLimit':LIMIT,
        'scope':'Timing and numerical equivalence benchmark only; not channel qualification.',
        'snapshotSources':{p.name:sha(p) for p in sources.glob('*.py')},
        'inputSha256':{str(p):sha(p) for p in [REFERENCE/'setup.json',REFERENCE/'model.xml',
            REFERENCE/'waves.npz',ROOT/'dist/si-channel-review/field-solver-handoff.json',OUT/'frozen-plan.json']}})
    return steps

def child(args):
    sys.path.insert(0,str(OUT/'frozen-sources'))
    import em3d
    em3d.ROOT=ROOT
    import batch_em3d
    native=batch_em3d.openEMS
    class ThreadOverride:
        def __init__(self,**kwargs):self.fdtd=native(**kwargs)
        def __getattr__(self,name):return getattr(self.fdtd,name)
        def Run(self,*positional,**kwargs):
            kwargs['numThreads']=args.threads
            return self.fdtd.Run(*positional,**kwargs)
    batch_em3d.openEMS=ThreadOverride
    values=json.loads((REFERENCE/'setup.json').read_text())['runArguments']
    values.update(output_root=str(OUT/args.trial),suite='benchmark',
        plan_file=str(OUT/'frozen-plan.json'),steps=args.steps,setup_only=False)
    start=time.time();batch_em3d.run(argparse.Namespace(**values));usage=resource.getrusage(resource.RUSAGE_SELF)
    save(OUT/args.trial/'runtime.json',{'threads':args.threads,'wallSeconds':time.time()-start,
        'cpuSeconds':usage.ru_utime+usage.ru_stime,'peakMemoryBytes':usage.ru_maxrss,
        'endedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})

def compare(directory):
    assert json.loads((directory/'status.json').read_text())['state']=='completed'
    assert model_hash(directory/'model.xml')==model_hash(REFERENCE/'model.xml'),'Model changed'
    old=json.loads((REFERENCE/'setup.json').read_text());new=json.loads((directory/'setup.json').read_text())
    for key in ['meshLines','ports','terminalGaps','lineMeasurement','boundsMm','layerZMm','regionPlan']:
        assert old[key]==new[key],key
    files=[f'port_{kind}_{i}' for kind in ['ut','it'] for i in range(1,5)]
    files += [p['voltageFilename'] for p in old['lineMeasurement']]
    files += [name for p in old['lineMeasurement'] for name in p['currentFilenames']]
    residual=0.;exact=True
    for name in files:
        a=np.loadtxt(REFERENCE/name,comments='%');b=np.loadtxt(directory/name,comments='%')
        assert a.shape==b.shape,(name,a.shape,b.shape)
        assert np.array_equal(a[:,0],b[:,0]),(name,'time grid')
        exact=exact and np.array_equal(a[:,1],b[:,1])
        residual=max(residual,float(np.max(abs(a[:,1]-b[:,1]))/max(float(np.max(abs(a[:,1]))),1e-30)))
    a=np.load(REFERENCE/'waves.npz');b=np.load(directory/'waves.npz');response=0.
    assert np.array_equal(a['frequency'],b['frequency'])
    for name in ['a','b','am','bm','response']:
        response=max(response,float(np.max(abs(a[name]-b[name]))/max(float(np.max(abs(a[name]))),1e-30)))
    assert residual<LIMIT and response<LIMIT,(residual,response)
    return {'passed':True,'maximumNormalizedTimeWaveChange':residual,
        'maximumNormalizedFrequencyWaveChange':response,'timeWavesBitwiseIdentical':exact,
        'fullPrecisionSetupMatched':True,'serializedModelMatched':True,'limit':LIMIT}

def main():
    steps=prepare();reservation=CAMPAIGN/'launch-reservation.json'
    assert not reservation.exists(),'A reservation already exists; inspect its owner before rerunning'
    paused=[];results=[]
    record={'pid':os.getpid(),'workers':4,'expiresUnix':time.time()+7200,
        'reason':'Isolated CPU thread benchmark; native states retained for automatic resumption.',
        'pausedNativeJobs':paused}
    save(reservation,record)
    def interrupted(signum,frame):raise KeyboardInterrupt('Benchmark interrupted; resume native jobs')
    signal.signal(signal.SIGTERM,interrupted)
    try:
        jobs=json.loads((CAMPAIGN/'jobs.json').read_text())['jobs']
        for job in jobs:
            directory=Path(job['directory']);status=directory/'status.json'
            if not status.exists() or json.loads(status.read_text()).get('state')!='running':continue
            pid=json.loads((directory/'process.json').read_text())['pid']
            command=subprocess.check_output(['ps','-p',str(pid),'-o','args='],text=True).strip()
            assert str(ROOT/'simulations/channel-si/batch_em3d.py') in command,command
            item={'pid':pid,'command':command,'directory':str(directory)}
            paused.append(item);save(reservation,record)
            os.kill(pid,signal.SIGSTOP)
        for number,threads in enumerate([8,4,2,2,4,8],1):
            trial=f'trial-{number}-threads-{threads}';(OUT/trial).mkdir()
            save(OUT/'progress.json',{'state':'running','trial':trial,'threads':threads,
                'productionNativePaused':True,'results':results})
            command=[sys.executable,str(Path(__file__).resolve()),'--child','--threads',str(threads),'--steps',str(steps),'--trial',trial]
            with (OUT/trial/'solver.log').open('w') as log:
                result=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,timeout=1800)
            assert result.returncode==0,(trial,result.returncode)
            directory=OUT/trial/'benchmark'/REFERENCE.name
            checks=compare(directory);timing=json.loads((OUT/trial/'runtime.json').read_text())
            log=(OUT/trial/'solver.log').read_text()
            match=re.search(r'Time for \d+ iterations with [\d.]+ cells : ([\d.]+) sec',log)
            timing['fieldSeconds']=float(match[1]);timing['setupSeconds']=timing['wallSeconds']-timing['fieldSeconds']
            row={'trial':trial,**timing,'checks':checks};results.append(row)
            save(OUT/'progress.json',{'state':'running','productionNativePaused':True,'results':results});print(json.dumps(row),flush=True)
        save(OUT/'results.json',{'passed':True,'scope':'Frozen local case; production native jobs paused during trials. Other applications can affect timing.',
            'reference':str(REFERENCE),'trials':results,'criteriaChanged':False,
            'recommendation':'Compare repeated timings before changing production thread settings.'})
        save(OUT/'progress.json',{'state':'completed','results':results})
    except Exception as error:
        save(OUT/'progress.json',{'state':'failed','error':str(error),'results':results});raise
    finally:
        for item in paused:
            command=subprocess.run(['ps','-p',str(item['pid']),'-o','args='],capture_output=True,text=True)
            if command.returncode==0 and command.stdout.strip()==item['command']:
                os.kill(item['pid'],signal.SIGCONT)
        if reservation.exists() and json.loads(reservation.read_text()).get('pid')==os.getpid():reservation.unlink()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--child',action='store_true')
    parser.add_argument('--threads',type=int);parser.add_argument('--steps',type=int);parser.add_argument('--trial')
    args=parser.parse_args()
    if args.child:child(args)
    else:main()
