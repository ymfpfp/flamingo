"""Plot extraction coverage, signal vias, return stitches and reference planes."""
from pathlib import Path
import json,argparse
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle,Circle

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT/'dist/si-channel-review/all-channels')
OUT=parser.parse_args().root.resolve()
plan=json.loads((OUT/'plan.json').read_text());g=json.loads((ROOT/'dist/si-channel-review/field-solver-handoff.json').read_text())
jobs=json.loads((OUT/'jobs.json').read_text())['jobs'] if (OUT/'jobs.json').exists() else []
fig,axes=plt.subplots(3,4,figsize=(15,10),layout='constrained')
for ax,p in zip(axes.flat,plan['plans']):
    selected_job=next((j for j in jobs if j['channel']==p['channel'] and j['suite']=='coarse' and j['mode']=='d1'),None)
    preferred=Path(selected_job['directory'])/'setup.json' if selected_job else None
    candidates=([preferred] if preferred and preferred.exists() else [])+list((OUT/'coarse').glob(f"board-{p['channel']}-*-d1/setup.json"))+list((OUT/'preflight-coarse').glob(f"board-{p['channel']}-*-d1/setup.json"))
    selected=json.loads(candidates[0].read_text()) if candidates else None
    xl,yl,xh,yh=selected['boundsMm'] if selected else p['boundsMm'];ax.add_patch(Rectangle((xl,yl),xh-xl,yh-yl,fill=False,ls=':',color='#666'))
    for e in g['boardContext']:
        if e['type']=='pcb_cutout':
            points=e['points'];ax.fill([v['x'] for v in points],[v['y'] for v in points],color='#d9dce0',alpha=.8)
    for via in g['groundVias']:
        if xl-.1<via['x']<xh+.1 and yl-.1<via['y']<yh+.1:ax.plot(via['x'],via['y'],'+',color='#8b5aa3',ms=6)
    for polarity,segments in enumerate(p['segments']):
        color=['#bf3838','#2465b0'][polarity]
        for s in segments:ax.plot([s['from'][0],s['to'][0]],[s['from'][1],s['to'][1]],color=color,lw=2,ls='-' if s['layer']=='top' else '--')
    for v in p['selectedVias']:
        ax.add_patch(Circle((v['x'],v['y']),v['outer_diameter']/2,fill=False,color='#173044',lw=1))
        ax.add_patch(Circle((v['x'],v['y']),v['hole_diameter']/2,color='white',ec='#173044',lw=.7))
    setup=OUT/'preflight-v2'/f"board-{p['channel']}-0.04-3-d1/setup.json"
    ports=selected['ports'] if selected else json.loads(setup.read_text())['ports'] if setup.exists() else p['ports']
    for number,port in enumerate(ports,1):
        x,y=port['xy'];ax.plot(x,y,'o',ms=5,color='#237a4b');ax.annotate(str(number),(x,y),xytext=(4,4),textcoords='offset points',fontsize=8)
        if 'feedXY' in port:
            fx,fy=port['feedXY'];ax.plot([x,fx],[y,fy],color='#237a4b',lw=1);ax.plot(fx,fy,'s',color='#237a4b',ms=3)
    ax.set_title(p['channel']);ax.set(xlim=(xl-.1,xh+.1),ylim=(yl-.1,yh+.1),xlabel='x (mm)',ylabel='y (mm)');ax.set_aspect('equal');ax.grid(alpha=.15)
for ax in list(axes.flat)[len(plan['plans']):]:ax.set_visible(False)
fig.suptitle('Local extraction coverage — P red, N blue; top solid, bottom dashed; ground stitches purple; reference planes green')
fig.savefig(OUT/'fixtures.png',dpi=160);plt.close(fig)
