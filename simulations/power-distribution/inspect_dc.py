"""Visualize the existing resistor solve without changing its equations."""
import hashlib,json,sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from check_dc import solve

source=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
j=json.loads(source.read_text());results=[]
for rail in ['VCCL','VDD']:
    result=solve(j,rail,.1,diagnostic_dir=out);results.append(result)
    fig,axes=plt.subplots(1,len(result['layers']),figsize=(5*len(result['layers']),7),layout='constrained',sharex=True,sharey=True)
    for ax,layer in zip(axes,result['layers']):
        d=np.load(out/f'{rail}-{layer}.npz')
        image=ax.pcolormesh(d['x'],d['y'],d['drop_mv'],shading='nearest',cmap='inferno',vmin=0,vmax=result['maximumDropMV'])
        ax.set(title=layer,xlim=(0,46.5),ylim=(76,114),xlabel='X (mm)');ax.set_aspect('equal')
        ax.grid(alpha=.15)
    axes[0].set_ylabel('Y (mm)')
    fig.colorbar(image,ax=axes,label='Drop from feedback contact (mV)',shrink=.75)
    fig.suptitle(f'{rail}: 3 A / 80 °C resistor screen — {result["maximumDropMV"]:.3f} mV maximum')
    fig.savefig(out/f'{rail}-voltage.png',dpi=150);plt.close(fig)
    print(rail,result['maximumDropMV'],flush=True)
(out/'diagnostics.json').write_text(json.dumps({'sourceFile':str(source),
    'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'scope':'Fine-grid conductor drop before the separate mesh allowance. Equal current per bridge supply ball.',
    'results':results},indent=2)+'\n')
