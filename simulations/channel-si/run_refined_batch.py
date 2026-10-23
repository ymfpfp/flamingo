"""Run selected corrected extraction jobs and retain native evidence."""
from pathlib import Path
from collections import Counter
import argparse,json,subprocess,sys,time,os,signal,hashlib,math
from run_channel_batch import convergence,save
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review/refined-channels'

def next_job_index(pending,active,max_per_channel,eligible=None):
    """Preserve job priority while allowing independent channels to overlap."""
    counts=Counter(j['channel'] for j in active)
    return next((i for i,j in enumerate(pending)
        if (not max_per_channel or counts[j['channel']]<max_per_channel)
        and (eligible is None or eligible(j))),None)

def file_sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def job_option(job,name):
    args=job['arguments']
    return args[args.index(name)+1] if name in args else None

def validate_job_inputs(job,input_root=None):
    """Bind each new job to its frozen inputs before native work starts."""
    for key,option in [('planSha256','--plan-file'),('handoffSha256','--handoff-file')]:
        if job.get(key):
            path=job_option(job,option);assert path and file_sha(path)==job[key],(job['channel'],key)
    if input_root:
        for key,name in [('sourceSha256','board.circuit.json'),('handoffSha256','field-solver-handoff.json'),('selectedStackupSha256','selected.json')]:
            assert job.get(key) and file_sha(input_root/name)==job[key],(job['channel'],key)

def preflight_cases():
    path=OUT/'preflight.json'
    return json.loads(path.read_text()).get('cases',[]) if path.exists() else []

def ready_case(job,cases):
    return next((c for c in cases if c['channel']==job['channel'] and c['suite']==job['suite']
        and c['returncode']==0 and c.get('planSha256')==job.get('planSha256')),None)

def job_cells(job,cases):
    ready=ready_case(job,cases)
    if ready and ready.get('meshCells'):return ready['meshCells']
    path=Path(job['directory'])/'setup.json'
    return math.prod(json.loads(path.read_text())['meshLines'].values()) if path.exists() else 0

def launch_reservation():
    """Honor a live benchmark's temporary reservation; recover if it exits."""
    path=OUT/'launch-reservation.json'
    if not path.exists():return None
    try:
        reservation=json.loads(path.read_text())
        live=reservation['expiresUnix']>time.time()
        try:os.kill(reservation['pid'],0)
        except ProcessLookupError:live=False
        if live:return reservation
        # The benchmark normally resumes these in its finally block. Recover
        # after a killed/expired owner as well, checking identity before signals.
        for item in reservation.get('pausedNativeJobs',[]):
            command=subprocess.run(['ps','-p',str(item['pid']),'-o','args='],capture_output=True,text=True)
            if command.returncode==0 and command.stdout.strip()==item['command']:
                os.kill(item['pid'],signal.SIGCONT)
        path.unlink(missing_ok=True)
        return None
    except (OSError,ValueError,KeyError):return None

def main(args):
    assert args.workers>0 and args.max_preparing>0,'Worker limits must be positive'
    assert args.max_per_channel>=0,'Per-channel limit must be nonnegative'
    jobs=json.loads((OUT/'jobs.json').read_text())['jobs']
    if args.channels:jobs=[j for j in jobs if j['channel'] in args.channels.split(',')]
    if args.suites:jobs=[j for j in jobs if j['suite'] in args.suites.split(',')]
    if args.setup_only:
        rows=[]
        for j in jobs:
            if j['mode'] not in ['d1','d2']:continue
            # One setup per geometry is enough; each excitation shares it.
            if j['suite'] in ['coarse','fine'] and j['mode']!='d1':continue
            if j['suite'] not in ['coarse','fine'] and j['mode']!='d2':continue
            command=[sys.executable,str(ROOT/'simulations/channel-si'/j.get('driver','batch_em3d.py')),*j['arguments'],'--setup-only']
            # Keep dry runs separate from selected native data.
            command[command.index('--suite')+1]='preflight-'+j['suite']
            result=subprocess.run(command,cwd=ROOT,text=True,capture_output=True)
            row={'channel':j['channel'],'suite':j['suite'],'returncode':result.returncode,'output':result.stdout.strip(),'error':result.stderr[-1800:]}
            rows.append(row);print(json.dumps(row),flush=True)
        save(OUT/'preflight.json',{'passed':all(r['returncode']==0 for r in rows),'cases':rows});return
    active=[];pending=[];finished=[];gate=None;analysis=None;analyzed_count=-1;analysis_count=-1
    for j in jobs:
        f=Path(j['directory'])/'status.json';status=json.loads(f.read_text()) if f.exists() else {}
        if status.get('state')=='completed':finished.append({**j,'returncode':0,'reused':True})
        elif status.get('state')=='running':active.append({**j,'process':None,'log':None})
        else:pending.append(j)
    while pending or active:
        # Preflight can repair one not-yet-started geometry while independent
        # suites run. Refresh only pending recipes; live cases remain frozen.
        if args.require_preflight:
            fresh={j['directory']:j for j in json.loads((OUT/'jobs.json').read_text())['jobs']}
            pending=[fresh[j['directory']] for j in pending]
        cases=preflight_cases() if args.require_preflight or args.max_active_cells else []
        while pending and len(active)<args.workers and not args.drain:
            reservation=launch_reservation()
            if reservation and len(active)>=args.workers-reservation.get('workers',1):break
            # Operator construction uses CPU threads. Stagger it so completed
            # operators can advance on the GPU while the next ones are built.
            preparing=sum(not (Path(j['directory'])/'port_it_4').exists() for j in active)
            if preparing>=args.max_preparing:break
            active_cells=sum(job_cells(j,cases) for j in active) if args.max_active_cells else 0
            def eligible(job):
                if args.require_preflight and ready_case(job,cases) is None:return False
                return not args.max_active_cells or not active or active_cells+job_cells(job,cases)<=args.max_active_cells
            index=next_job_index(pending,active,args.max_per_channel,eligible)
            if index is None:break
            if args.gate_prototype and gate is not True and pending[index]['channel'] not in ['CALIBRATION','USB4_TX1','PCIE_RX3']:
                if active:break
                from analyze_refined_channels import review
                assessment=review();prototypes=[c for c in assessment['channels'] if c['channel'] in ['USB4_TX1','PCIE_RX3']]
                gate=bool(assessment['calibration'].get('passed') and all(c['allExtractionChecksPassed'] for c in prototypes))
                save(OUT/'prototype-gate.json',{'passed':gate,'calibrationPassed':assessment['calibration'].get('passed'),
                    'channels':[{k:c[k] for k in ['channel','coarse','fine','mesh','studies','physicalGeometryBetweenMeshes']} for c in prototypes]})
                if not gate:
                    save(OUT/args.progress,{'total':len(jobs),'finished':len(finished),'failed':sum(j['returncode']!=0 for j in finished),
                        'active':[],'pending':len(pending),'prototypeGatePassed':False,'updatedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'results':finished})
                    print('Prototype needs further refinement before the full run.',flush=True);return
            j=pending.pop(index);validate_job_inputs(j,args.input_root)
            p=Path(j['directory']);p.mkdir(parents=True,exist_ok=True);log=(p/'solver.log').open('w')
            process=subprocess.Popen([sys.executable,str(ROOT/'simulations/channel-si'/j.get('driver','batch_em3d.py')),*j['arguments']],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
            save(p/'process.json',{'pid':process.pid})
            active.append({**j,'process':process,'log':log});print(json.dumps({'event':'started','channel':j['channel'],'suite':j['suite'],'mode':j['mode'],'pid':process.pid}),flush=True)
        progress=[]
        for j in list(active):
            p=Path(j['directory']);f=p/'status.json';s=json.loads(f.read_text()) if f.exists() else {}
            code=j['process'].poll() if j['process'] else (0 if s.get('state')=='completed' else None)
            if j['process'] is None and code is None and (p/'process.json').exists():
                try:os.kill(json.loads((p/'process.json').read_text())['pid'],0)
                except ProcessLookupError:code=1
            if code is not None:
                if j['log']:j['log'].close()
                if code!=0 or s.get('state')!='completed':save(f,{'state':'failed','returncode':code})
                row={k:v for k,v in j.items() if k not in ['process','log']};row['returncode']=code
                finished.append(row);active.remove(j);print(json.dumps({'event':'finished','channel':j['channel'],'suite':j['suite'],'mode':j['mode'],'returncode':code}),flush=True)
            else:
                try:value=convergence(p) if (p/'port_it_4').exists() else {'state':'preparing'}
                except AssertionError as error:
                    (p/'ABORT').write_text('Native probe validation failed.\n');value={'error':str(error)}
                progress.append({'channel':j['channel'],'suite':j['suite'],'mode':j['mode'],**value})
        save(OUT/args.progress,{'total':len(jobs),'finished':len(finished),'failed':sum(j['returncode']!=0 for j in finished),
            'active':progress,'pending':len(pending),
            'scheduling':{'workers':args.workers,'maxPreparing':args.max_preparing,
                'maxPerChannel':args.max_per_channel,'prototypeGateEnabled':args.gate_prototype,
                'benchmarkReservation':launch_reservation(),'launchesDisabled':args.drain,
                'requirePreflight':args.require_preflight,'maxActiveCells':args.max_active_cells},
            'updatedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'results':finished})
        if args.analyze:
            if analysis and analysis.poll() is not None:
                if analysis.returncode==0:analyzed_count=analysis_count
                else:print(json.dumps({'event':'analysis-failed','returncode':analysis.returncode}),flush=True)
                analysis=None
            if analysis is None and len(finished)!=analyzed_count:
                command=[sys.executable,str(ROOT/'simulations/channel-si/analyze_refined_channels.py'),'--root',str(OUT)]
                if args.input_root:command+=['--input-root',str(args.input_root)]
                with (OUT/'analysis.log').open('a') as log:analysis=subprocess.Popen(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
                analysis_count=len(finished)
        if args.drain and not active:
            print(json.dumps({'event':'active-cases-drained','finished':len(finished),'pending':len(pending)}),flush=True);return
        if pending or active:time.sleep(10)
    print(json.dumps({'event':'completed','finished':len(finished)}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--channels');p.add_argument('--suites');p.add_argument('--workers',type=int,default=4)
    p.add_argument('--setup-only',action='store_true');p.add_argument('--gate-prototype',action='store_true')
    p.add_argument('--max-preparing',type=int,default=2)
    p.add_argument('--drain',action='store_true',help='Finish active cases without launching queued cases.')
    p.add_argument('--max-per-channel',type=int,default=0,
        help='Concurrent jobs per channel; 0 preserves unrestricted legacy scheduling. Existing jobs are retained.')
    p.add_argument('--root',type=Path,default=OUT)
    p.add_argument('--input-root',type=Path)
    p.add_argument('--require-preflight',action='store_true')
    p.add_argument('--max-active-cells',type=int,default=0,help='Bound concurrent model cells without changing any mesh.')
    p.add_argument('--analyze',action='store_true',help='Refresh numerical results after native completions.')
    p.add_argument('--progress',default='progress.json')
    args=p.parse_args();OUT=args.root.resolve()
    if args.input_root:args.input_root=args.input_root.resolve()
    main(args)
