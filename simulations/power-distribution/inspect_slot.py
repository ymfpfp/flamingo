"""Plot the emitted slot-power geometry and saved DC solution. No routing."""
import json,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.path import Path as MP
from matplotlib.patches import PathPatch,Patch
from check_layout import model

source,report_file,map_dir,out=map(Path,sys.argv[1:5]);out.mkdir(parents=True,exist_ok=True)
report=json.loads(report_file.read_text())
j,sc,sp,pp,st,vs,ps,cu,ns,root,vn,port=model(json.loads(source.read_text()))
def polygon(ax,geom,color,alpha=1):
 for p in getattr(geom,'geoms',[geom]):
  if p.geom_type!='Polygon':continue
  paths=[MP(list(r.coords),[MP.MOVETO]+[MP.LINETO]*(len(r.coords)-2)+[MP.CLOSEPOLY]) for r in [p.exterior,*p.interiors]]
  ax.add_patch(PathPatch(MP.make_compound_path(*paths),facecolor=color,edgecolor='none',alpha=alpha))
colors={ns[n]:c for n,c in [('V12V','#cc8b19'),('SLOT_12V','#d7474e'),('VCCH','#168e7c'),('SLOT_3V3','#575dcc'),('GND','#d4dbe2'),('V5V','#c8bc75'),('VCCL','#90a995'),('VDD','#8da2b6')]}
fig,axes=plt.subplots(1,4,figsize=(14,10),layout='constrained',sharex=True,sharey=True)
for ax,layer in zip(axes,['top','inner2','inner3','bottom']):
 for o in cu:
  if layer in o['layers']:polygon(ax,o['shape'],colors.get(o['net'],'#777777'))
 ax.set(title=layer,xlim=(0,53),ylim=(10,124),aspect='equal',xlabel='X (mm)');ax.grid(alpha=.15)
axes[0].set_ylabel('Y (mm)')
fig.legend(handles=[Patch(color=colors[ns[n]],label=n)for n in ['V12V','SLOT_12V','VCCH','SLOT_3V3','V5V','VCCL','VDD','GND']],loc='outside lower center',ncol=4,fontsize=9)
fig.savefig(out/'power-copper.png',dpi=160);plt.close(fig)
for rail in ['V12V','SLOT_12V']:
 result=next(r for r in report['results'] if r['rail']==rail)
 files=[(layer,map_dir/f'{rail}-{layer}-0.12.npz') for layer in ['top','inner2','inner3','bottom']]
 files=[(l,f) for l,f in files if f.exists()]
 fig,axes=plt.subplots(1,len(files),figsize=(3.6*len(files),9),layout='constrained',sharex=True,sharey=True)
 axes=np.atleast_1d(axes)
 for ax,(layer,file) in zip(axes,files):
  d=np.load(file);m=ax.pcolormesh(d['x'],d['y'],d['drop_mv'],shading='nearest',cmap='inferno',vmin=0,vmax=result['fine']['dropMV'])
  ax.set(title=layer,xlim=(0,53),ylim=(10,124),aspect='equal',xlabel='X (mm)');ax.grid(alpha=.15)
 axes[0].set_ylabel('Y (mm)');fig.colorbar(m,ax=axes,label='Voltage drop from feed (mV)',shrink=.7)
 fig.suptitle(f'{rail}: 5.5 A, 80 °C copper; fine mesh before allowance',fontsize=12)
 fig.savefig(out/f'{rail}-drop.png',dpi=160);plt.close(fig)
print(out)
