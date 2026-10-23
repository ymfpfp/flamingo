"""Run independent extraction jobs with bounded concurrency and convergence stops."""
from pathlib import Path
import argparse,json,os,subprocess,sys,time
import numpy as np
from analyze_extraction import read_case,waves

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review/all-channels'
MODES=['d1','d2','c1','c2']
def save(path,value):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2)+'\n');temp.replace(path)

def path_for(job):return OUT/job['suite']/f"board-{job['channel']}-{job['resolution']:g}-3-{job['mode']}"

def convergence(path):
    try:
        case=read_case(path)
        end=min(min(a[-1,0],b[-1,0]) for a,b in case['records'])*1e9
        if end<.8:return {'timeNS':end,'converged':False}
        k=['d1','d2','c1','c2'].index(case['setup']['excitation']);a,b=waves(case);full=b/a[:,k,None]
        change=0.
        for fraction in [.65,.8]:
            aa,bb=waves(case,fraction);change=max(change,float(np.max(abs(bb/aa[:,k,None]-full))))
        value={'timeNS':end,'maximumComplexChange':change,'converged':change<.001}
        file=path/'batch-time-checkpoint.json';previous=json.loads(file.read_text()) if file.exists() else None
        if value['converged'] and previous and previous['converged'] and end-previous['timeNS']>.05:
            (path/'ABORT').write_text('Two passing frequency-record checks; original numerical limits unchanged.\n')
            save(path/'batch-time-stop.json',value);value['stopRequested']=True
        if not(value['converged'] and previous and previous['converged'] and end-previous['timeNS']<=.05):save(file,value)
        return value
    except (OSError,ValueError,IndexError,KeyError):return {'timeNS':None,'converged':False}

def main(args):
    plans=json.loads((OUT/'plan.json').read_text())['plans'];channels=[p['channel'] for p in plans if p['supported']]
    if args.channels:channels=args.channels.split(',')
    jobs=[]
    if args.phase in ['coarse','all']:
        jobs += [dict(channel=c,suite='coarse',resolution=.04,mode=m,extra=[]) for c in channels for m in ['d1','d2','c1','c2']]
    if args.phase in ['fine','all']:
        jobs += [dict(channel=c,suite='fine',resolution=.025,mode=m,extra=[]) for c in channels for m in ['d1','d2','c1','c2']]
    if args.phase in ['validation','all']:
        for c in channels:
            for suite,extra in [('crop',['--crop-margin','.8']),('padding',['--padding','2.5','--air-height','2.6']),('vertical',['--z-refinement','2']),('mask',['--open-pads'])]:
                jobs += [dict(channel=c,suite=suite,resolution=.04,mode=m,extra=extra) for m in ['d2','c2']]
    ranks={'coarse':0,'fine':1,'crop':2,'padding':3,'vertical':4,'mask':5}
    jobs.sort(key=lambda j:(0 if j['suite'] in ['coarse','fine'] else 1,channels.index(j['channel']),ranks[j['suite']],MODES.index(j['mode'])))
    active=[];pending=[];finished=[]
    for job in jobs:
        path=path_for(job);file=path/'status.json';status=json.loads(file.read_text()) if file.exists() else {}
        if status.get('state')=='completed':finished.append({**job,'returncode':0,'reused':True})
        elif status.get('state')=='running':active.append({**job,'process':None,'log':None,'external':True})
        else:pending.append(job)
    last_event=0
    while pending or active:
        while pending and len(active)<args.workers:
            job=pending.pop(0);path=path_for(job);path.mkdir(parents=True,exist_ok=True)
            log=(path/'solver.log').open('w')
            command=[sys.executable,str(ROOT/'simulations/channel-si/batch_em3d.py'),'--channel',job['channel'],'--suite',job['suite'],
                     '--resolution',str(job['resolution']),'--excitation',job['mode'],*job['extra']]
            process=subprocess.Popen(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
            active.append({**job,'process':process,'log':log,'external':False})
            print(json.dumps({'event':'started',**job,'pid':process.pid}),flush=True)
        progress=[]
        for job in list(active):
            path=path_for(job);file=path/'status.json';status=json.loads(file.read_text()) if file.exists() else {}
            code=job['process'].poll() if job['process'] else (0 if status.get('state')=='completed' else None)
            if code is not None:
                if job['log']:job['log'].close()
                if code!=0 or status.get('state')!='completed':save(file,{'state':'failed','returncode':code})
                row={k:v for k,v in job.items() if k not in ['process','log']};row['returncode']=code
                finished.append(row);active.remove(job);print(json.dumps({'event':'finished',**row}),flush=True)
                if code==0 and job['suite'] in ['coarse','fine']:
                    try:
                        from analyze_channel_batch import inspect
                        result=inspect(job['channel'],job['suite'],job['resolution'])
                        if result['complete']:print(json.dumps({'event':'numerical-result','channel':job['channel'],'suite':job['suite'],'passed':result['passed'],'checks':result['checks']}),flush=True)
                    except Exception as error:print(json.dumps({'event':'analysis-error','channel':job['channel'],'suite':job['suite'],'error':str(error)}),flush=True)
            elif (path/'port_it_4').exists():
                try:progress.append({'channel':job['channel'],'suite':job['suite'],'mode':job['mode'],**convergence(path)})
                except AssertionError as error:
                    (path/'ABORT').write_text('Probe validation failed.\n');progress.append({'channel':job['channel'],'error':str(error)})
            else:progress.append({'channel':job['channel'],'suite':job['suite'],'mode':job['mode'],'state':'preparing'})
        state={'phase':args.phase,'total':len(jobs),'finished':len(finished),'failed':sum(j.get('returncode')!=0 for j in finished),
               'active':progress,'pending':len(pending),'updatedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'results':finished}
        save(OUT/f'progress-{args.phase}.json',state)
        if pending or active:time.sleep(10)
    print(json.dumps({'event':'batch-completed','phase':args.phase,'finished':len(finished),'failed':state['failed']}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--phase',choices=['coarse','fine','validation','all'],default='all')
    p.add_argument('--workers',type=int,default=2);p.add_argument('--channels');main(p.parse_args())
