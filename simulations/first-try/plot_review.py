"""Plot conditional static voltage margins; no regulator or thermal simulation."""
from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parents[2]
out = root / 'dist/first-try-review'
report = json.loads((out / 'results.json').read_text())
plt.rcParams.update({'font.size': 11, 'axes.spines.top': False, 'axes.spines.right': False})
fig, ax = plt.subplots(figsize=(9, 5.4), layout='constrained')
for rail, color in zip(report['rails'], ['#086788', '#a33b20']):
    loads = rail['loads']
    ax.plot([r['currentA'] for r in loads], [r['remainingBeforeRippleMV'] for r in loads],
            'o-', color=color, linewidth=2, label=rail['rail'])
    ax.axvline(rail['currentForZeroStaticMarginA'], color=color, linestyle=':', alpha=.6)
ax.axhline(0, color='#333333', linewidth=1)
ax.axhspan(-8, 0, color='#f9d8d3', alpha=.6)
ax.set(xlabel='Assumed current on each bridge rail (A)',
       ylabel='Remaining static low-voltage margin (mV)',
       title='PCB drop consumes the remaining regulator margin',
       xlim=(.4, 3.1), ylim=(-8, 14))
ax.text(.53, -6.7, 'Negative margin: conditional operating-voltage failure', fontsize=10, color='#8b2920')
ax.grid(alpha=.18)
ax.legend(loc='upper right')
fig.supxlabel('80 °C copper • static regulator low corner • mesh allowance included\n'
              'PD maxima used as provisional PDX current proxies. Ripple, ground/package loss and transients excluded.', fontsize=9)
fig.savefig(out / 'power-margin.png', dpi=180)
plt.close(fig)
print(out / 'power-margin.png')
