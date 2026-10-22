"""Plot exact clearance reservations for layout inspection; no route search."""
import json,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as Patch
import shapely
from shapely.geometry import Point,box

job_file,cover_file,output=map(Path,sys.argv[1:4])
job=json.loads(job_file.read_text());cover=json.loads(cover_file.read_text())
xs=[t['x'] for t in job['terminals']];ys=[t['y'] for t in job['terminals']];pad=job.get('routingPaddingMm',6)
window=box(min(xs)-pad,min(ys)-pad,max(xs)+pad,max(ys)+pad)
fig,axes=plt.subplots(1,2,figsize=(15,8))
for ax,layer in zip(axes,['top','bottom']):
    shape=shapely.from_wkb(bytes.fromhex(cover['forbiddenShapesWkbHex'][layer])).buffer(job['rule']['widthMm']/2+.0001)
    free=window.difference(shape)
    components=[s for s in getattr(free,'geoms',[free]) if s.geom_type=='Polygon']
    for poly in getattr(shape,'geoms',[shape]):
        if poly.geom_type!='Polygon':continue
        ax.add_patch(Patch(poly.exterior.coords,facecolor='#bec7d1',edgecolor='none'))
        for ring in poly.interiors:ax.add_patch(Patch(ring.coords,facecolor='white',edgecolor='none'))
    for i,t in enumerate(job['terminals']):
        ax.plot(t['x'],t['y'],'o',color='#d13737',markersize=4)
        ax.annotate(f"{i}: {t['selector']}",(t['x'],t['y']),xytext=(4,5),textcoords='offset points',fontsize=7)
    common=any(all(p.buffer(1e-7).covers(Point(t['x'],t['y'])) for t in job['terminals']) for p in components)
    ax.set(title=f'{layer}: all endpoints share free region = {common}',xlim=(min(xs)-pad,max(xs)+pad),ylim=(min(ys)-pad,max(ys)+pad),
           xlabel='x (mm)',ylabel='y (mm)',aspect='equal')
    ax.set_xticks(range(int(min(xs)-pad),int(max(xs)+pad)+1,2));ax.set_yticks(range(int(min(ys)-pad),int(max(ys)+pad)+1,2))
    ax.grid(alpha=.3)
fig.suptitle(f"{job['name']}: available trace-center space at strict clearances")
fig.tight_layout();fig.savefig(output,dpi=140)
print(output)
