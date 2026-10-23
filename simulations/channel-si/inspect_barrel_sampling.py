"""Inspect the same PEC sampling used for vertical via-current edges."""
from pathlib import Path
import argparse,json
import numpy as np
from CSXCAD import ContinuousStructure
from openEMS import openEMS
import batch_geometry
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review/all-channels'
def run(channel):
    plan=next(p for p in json.loads((OUT/'plan.json').read_text())['plans'] if p['channel']==channel)
    rows=[];fig,axes=plt.subplots(2,2,figsize=(8,8),layout='constrained')
    for ri,res in enumerate([.04,.025]):
        fdtd=openEMS();csx=ContinuousStructure();fdtd.SetCSX(csx);mesh=csx.GetGrid();mesh.SetDeltaUnit(.001)
        args=argparse.Namespace(crop_margin=0,padding=1.5,air_height=1.6,resolution=res,z_refinement=1)
        batch_geometry.setup(fdtd,csx,mesh,args,plan)
        x,y,z=[mesh.GetLines(a,do_sort=True) for a in ['x','y','z']];k=np.searchsorted(z,-.3)-1;zz=float((z[k]+z[k+1])/2)
        for vi,via in enumerate(plan['selectedVias']):
            ax=axes[ri,vi];xx=x[abs(x-via['x'])<.17];yy=y[abs(y-via['y'])<.17];points=[];area=0.
            for a in xx:
                for b in yy:
                    prop=csx.GetPropertyByCoordPriority([float(a),float(b),zz]);metal=bool(prop and prop.GetName()=='exported_copper_PEC')
                    points.append([float(a-via['x']),float(b-via['y']),metal])
                    if metal:
                        i=np.argmin(abs(x-a));j=np.argmin(abs(y-b));area+=(x[i+1]-x[i-1])/2*(y[j+1]-y[j-1])/2
            count=sum(p[2] for p in points);inner=via['hole_diameter']/2;outer=inner+.02
            rows.append({'resolutionMm':res,'via':via['pcb_via_id'],'verticalPECNodes':count,'sampledDualCellAreaMm2':float(area),
                'nominalAnnularAreaMm2':float(np.pi*(outer**2-inner**2)),'zEdgeMidpointMm':zz,'samples':points})
            for p in points:ax.plot(p[0]*1000,p[1]*1000,'o',ms=4,color='#173044' if p[2] else '#ccc')
            for radius in [inner,outer]:ax.add_patch(Circle((0,0),radius*1000,fill=False,color='#bf3838',lw=1))
            ax.set(xlabel='x offset (µm)',ylabel='y offset (µm)',title=f'{res:g} mm / {"PN"[vi]}: {count} metal edges',xlim=(-170,170),ylim=(-170,170));ax.set_aspect('equal');ax.grid(alpha=.2)
    fig.suptitle(channel+' — via barrel sampling on vertical Yee edges')
    fig.savefig(OUT/(channel+'-barrel-sampling.png'),dpi=160);plt.close(fig)
    result={'channel':channel,'interpretation':'PEC edge counts inspect discretization, not physical current density or a hardware pass/fail.',
        'cases':rows};(OUT/(channel+'-barrel-sampling.json')).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps([{k:v for k,v in r.items() if k!='samples'} for r in rows],indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('channel');run(p.parse_args().channel)
