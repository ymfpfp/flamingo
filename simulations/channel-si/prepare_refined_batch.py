"""Prepare isolated, corrected local extraction jobs for all twelve pairs."""
from pathlib import Path
import hashlib,json
from plan_batch import plan_channel
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/si-channel-review/refined-channels'

def main():
    old=json.loads((ROOT/'dist/si-channel-review/all-channels/plan.json').read_text())
    g=json.loads((ROOT/'dist/si-channel-review/field-solver-handoff.json').read_text())
    extra=next(c for c in g['channels'] if c['name']=='USB4_RX2')
    plans=old['plans']+[{'supported':True,**plan_channel(extra,g)}]
    data={**old,'plans':plans,'method':'Fixed physical feed gaps, feature meshes and enlarged local PCB regions.'}
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'plan.json').write_text(json.dumps(data,indent=2)+'\n')
    jobs=[];risk={'USB4_TX2','USB4_RX1','PCIE_RX1'}
    for p in plans:
        c=p['channel'];margin=2.4 if c in risk else .8
        for suite,res,barrel,z,extra_margin,padding,height,mask,modes in [
            ('coarse',.025,.0125,1,margin,1.5,1.6,True,['d1','d2','c1','c2']),
            ('fine',.02,1/120,1,margin,1.5,1.6,True,['d1','d2','c1','c2']),
            ('crop',.025,.0125,1,4.0 if c in risk else 2.4,1.5,1.6,True,['d2','c2']),
            ('padding',.025,.0125,1,margin,2.5,2.6,True,['d2','c2']),
            ('vertical',.025,.0125,2,margin,1.5,1.6,True,['d2','c2']),
            ('mask',.025,.0125,1,margin,1.5,1.6,False,['d2','c2'])]:
            for mode in modes:
                args=['--channel',c,'--suite',suite,'--resolution',str(res),'--excitation',mode,
                    '--fixed-feed-gap-mm','.0497','--feature-mesh','--barrel-step-mm',str(barrel),
                    '--crop-margin',str(extra_margin),'--z-refinement',str(z),'--padding',str(padding),
                    '--air-height',str(height),'--plan-file',str(OUT/'plan.json'),'--output-root',str(OUT)]
                if mask:args+=['--open-pads']
                jobs.append({'channel':c,'suite':suite,'resolution':res,'mode':mode,'arguments':args,
                    'directory':str(OUT/suite/f'board-{c}-{res:g}-3-{mode}')})
    ranks={'coarse':0,'fine':1,'crop':2,'padding':3,'vertical':4,'mask':5}
    channels=[p['channel'] for p in plans]
    jobs.sort(key=lambda j:(0 if j['suite'] in ['coarse','fine'] else 1,channels.index(j['channel']),ranks[j['suite']],['d1','d2','c1','c2'].index(j['mode'])))
    (OUT/'jobs.json').write_text(json.dumps({'jobs':jobs,'planSha256':hashlib.sha256((OUT/'plan.json').read_bytes()).hexdigest()},indent=2)+'\n')
    print(json.dumps({'channels':len(plans),'nativeJobs':len(jobs)}))

if __name__=='__main__':main()
