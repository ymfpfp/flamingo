"""Add local mesh hints when a return barrel has too few sampled edges."""
from pathlib import Path
import hashlib,json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review/refined-channels'

def main():
    for iteration in range(8):
        current=json.loads((OUT/'preflight.json').read_text())
        if current['passed']:print('All preflight checks passed.',flush=True);return
        plan=json.loads((OUT/'plan.json').read_text());changed=False
        for r in current['cases']:
            if r['returncode'] and 'Via barrel under-sampled' in r['error']:
                p=next(p for p in plan['plans'] if p['channel']==r['channel']);ids=set(p.get('extraMeshVias',[]))
                before=len(ids);ids.update(re.findall(r'pcb_via_\d+',r['error'].splitlines()[-1]));changed|=len(ids)>before;p['extraMeshVias']=sorted(ids)
        if not changed:raise RuntimeError('Preflight needs a geometry fix; no sampling hints to add.')
        (OUT/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
        jobs=json.loads((OUT/'jobs.json').read_text());jobs['planSha256']=hashlib.sha256((OUT/'plan.json').read_bytes()).hexdigest();(OUT/'jobs.json').write_text(json.dumps(jobs,indent=2)+'\n')
        with (OUT/f'preflight-round-{iteration+3}.log').open('w') as log:
            subprocess.run([sys.executable,str(ROOT/'simulations/channel-si/run_refined_batch.py'),'--setup-only'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
        current=json.loads((OUT/'preflight.json').read_text());print(json.dumps({'round':iteration+3,'passed':current['passed'],'failedCases':sum(r['returncode']!=0 for r in current['cases'])}),flush=True)
    raise RuntimeError('Preflight refinement needs further review.')

if __name__=='__main__':main()
