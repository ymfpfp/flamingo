"""Plot fixed-pad attachment limits. This is a diagnostic, not a router."""
import json
import sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as Patch, Patch as Legend
from shapely.geometry import box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'simulations/power-distribution'))
from check_layout import model
from check_feasibility import attachment_space

source, output = map(Path, sys.argv[1:3])
j, sc, sp, pp, st, vias, pours, copper, nets, root, via_net, port = model(json.loads(source.read_text()))
fig, axes = plt.subplots(1, 2, figsize=(12, 5.8))
for ax, pin in zip(axes, ['CC1', 'CC2']):
    p = port('ASM2464PDX', pin)
    pad = next(o['shape'] for o in copper if o['port'] == p['pcb_port_id'])
    foreign = [o['shape'] for o in copper if o['port'] and o['net'] != root(p['source_port_id'])
               and 'top' in o['layers'] and o['shape'].distance(pad) < 2]
    width, gap = .2032, .381
    contact = pad.buffer(width/2+.001, quad_segs=128)
    forbidden = unary_union([s.buffer(width/2+gap, quad_segs=128) for s in foreign])
    window = box(p['x']-.85, p['y']-.85, p['x']+.85, p['y']+.85)
    legal = attachment_space(pad, foreign, width, gap)
    def draw(shape, color, alpha=1, **kwargs):
        for poly in getattr(shape.intersection(window), 'geoms', [shape.intersection(window)]):
            if poly.is_empty or poly.geom_type != 'Polygon':
                continue
            xy = [(x-p['x'], y-p['y']) for x,y in poly.exterior.coords]
            ax.add_patch(Patch(xy, facecolor=color, alpha=alpha, **kwargs))
    draw(forbidden, '#e45b5b', .18)
    draw(contact, 'none', edgecolor='#d18c00', linewidth=2, hatch='///')
    for s in foreign:
        draw(s, '#697586')
    draw(pad, '#1768ac')
    draw(legal, '#1a9d65')
    ax.set(title=f'{pin}: no legal full-width attachment', xlabel='x from pin center (mm)', ylabel='y from pin center (mm)',
           xlim=(-.85,.85), ylim=(-.85,.85), aspect='equal')
    ax.grid(alpha=.15)
fig.suptitle('CC pin constraint: fixed pads alone', fontsize=17, weight='bold')
fig.legend(handles=[Legend(facecolor='#697586', label='Foreign pad'), Legend(facecolor='#1768ac', label='CC pad'),
    Legend(facecolor='none', edgecolor='#d18c00', hatch='///', label='Possible trace-end contact centers'),
    Legend(facecolor='#e45b5b', alpha=.18, label='Forbidden trace centers at 0.381 mm clearance')],
    loc='lower center', ncol=2, bbox_to_anchor=(.5,0), fontsize=10)
fig.text(.5,.145,'0.2032 mm trace width; conservative clearance to all foreign copper.\nNo traces, vias, pours or component moves are involved in this test.',
         ha='center', va='center', fontsize=10)
fig.subplots_adjust(top=.84, bottom=.27, wspace=.3)
fig.savefig(output, dpi=160)
print(output)
