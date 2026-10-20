"""Render an inspectable slot-power routing review from validated copper."""
import hashlib,html,json,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path as MP
from matplotlib.patches import PathPatch,Patch
from shapely.geometry import box
from check_layout import model,ROOT
OUT=ROOT/'dist/slot-power-routing';file=Path(sys.argv[1]);raw=file.read_bytes();sha=hashlib.sha256(raw).hexdigest();layout=json.loads((OUT/'layout-audit.json').read_text());dc=json.loads((OUT/'dc-audit.json').read_text());meta=json.loads((OUT/'audit.json').read_text());drc=json.loads((OUT/'drc.json').read_text())
assert layout['passed'] and meta['passed'] and drc['passed'] and layout['sourceSha256']==dc['sourceSha256']==sha
j,sc,sp,pp,st,vs,ps,cu,ns,r,vn,p=model(json.loads(raw));colors={ns[n]:c for n,c in [('V12V','#d7832b'),('SLOT_12V','#cc4b56'),('VCCH','#209c82'),('SLOT_3V3','#5d6aca'),('V5V','#e2ba44'),('VCCL','#a0b3a9'),('VDD','#b9c5d2'),('GND','#a5b1bd'),('ASM_HDDPC','#7739a1')]}
def draw(ax,layer,bounds):
 win=box(*bounds)
 for o in cu:
  if layer not in o['layers'] or not o['shape'].intersects(win):continue
  shape=o['shape'].intersection(win)
  for q in getattr(shape,'geoms',[shape]):
   if q.geom_type!='Polygon':continue
   paths=[MP(list(r.coords),[MP.MOVETO]+[MP.LINETO]*(len(r.coords)-2)+[MP.CLOSEPOLY]) for r in [q.exterior,*q.interiors]]
   ax.add_patch(PathPatch(MP.make_compound_path(*paths),facecolor=colors.get(o['net'],'#885e9e'),edgecolor='none',alpha=.9))
 ax.set(xlim=(bounds[0],bounds[2]),ylim=(bounds[1],bounds[3]),aspect='equal',xlabel='X (mm)',ylabel='Y (mm)');ax.grid(alpha=.12)
fig,axes=plt.subplots(1,2,figsize=(12,12))
for ax,layer,title in zip(axes,['inner2','inner3'],['L3','L4']):draw(ax,layer,(0,10,52.5,123.6));ax.set_title(title+' power copper')
fig.legend(handles=[Patch(color=colors[ns[n]],label=n) for n in ['V12V','SLOT_12V','VCCH','SLOT_3V3','ASM_HDDPC']],loc='lower center',ncol=5,frameon=False);fig.tight_layout(rect=(0,.035,1,1));fig.savefig(OUT/'power-layers.png',dpi=150);plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(13,6))
for ax,suffix,bounds in zip(axes,['12V','3V3'],[(24.5,52.5,39.5,63),(24.5,63,39.5,73.5)]):
 draw(ax,'top',bounds);ax.set_title(suffix+' switch, gate control and discharge')
 for part,pin,label in [(f'Q_SLOT_{suffix}','pin4','Gate'),(f'Q_SLOT_DRV_{suffix}','G','HDDPC'),(f'R_SLOT_DISCHARGE_{suffix}','pin1','Discharge')]:
  q=p(part,pin);ax.annotate(label,(q['x'],q['y']),xytext=(q['x']+.5,q['y']+.9),fontsize=9,arrowprops=dict(arrowstyle='-',lw=.5))
fig.tight_layout();fig.savefig(OUT/'controls.png',dpi=150);plt.close(fig)
rows=''.join(f"<tr><td>{q['rail']}</td><td>{q['currentA']:.1f} A</td><td>{q['conductorUpperDropMV']:.1f} mV</td><td>{q['mosfetDrop25CMaxRdsMV']:.1f} mV</td><td>{q['mosfetDissipation25CMaxRdsW']:.3f} W</td></tr>" for q in dc['channels'])
power=''.join(f"<li>{q['rail']}: {q['connectedTerminals']} connected terminals; minimum inner clearance {q['minimumPowerGapMm']:.3f} mm; continuous 0.381 mm core.</li>" for q in layout['power'])
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slot power routing</title><style>body{{margin:0;background:#f5f7fb;color:#19334a;font:16px/1.55 system-ui,sans-serif}}main{{max-width:1080px;margin:32px auto;padding:0 24px 50px}}h1{{line-height:1.2}}h2{{font-size:22px;margin-top:28px}}.card{{padding:20px;background:white;border:1px solid #d6e0ea;border-radius:10px}}.pass{{color:#176746}}.open{{color:#8a510c}}img{{width:100%;height:auto;background:white;border:1px solid #d6e0ea;border-radius:8px}}table{{border-collapse:collapse;width:100%;background:white}}td,th{{text-align:left;padding:10px;border-bottom:1px solid #d6e0ea}}code{{overflow-wrap:anywhere}}a{{color:#245ca6}}</style><main>
<h1>ATX 12 V and switched slot power</h1><div class="card"><strong class="pass">ROUTED · LAYOUT CHECKS PASS</strong><p>The ATX 12 V input feeds the 12 V switch. Both switched rails reach every slot power contact and their capacitor banks. Both gate-control networks, HDDPC, pulldown and discharge resistors have physical copper connections. All 69 slot ground contacts reach the reference planes. All 153 assembled components stay at their original top-side positions; all 330 earlier trace paths remain fixed.</p></div>
<h2>Power distribution</h2><p>Power uses L3/L4 copper with L2/L5 ground references. Parallel inner branches and via arrays carry the 12 V feed and output. The 3.3 V output uses an L3 crossbar, L4 side feeder and a separate L3 branch to its bulk capacitor. The slow HDDPC trunk uses L3/L4 crossings to preserve the flash and buck input feeds; local gate controls stay on top.</p><ul>{power}</ul><img src="power-layers.png" alt="Actual L3 and L4 copper for ATX input, switched slot supplies and the HDDPC control trunk.">
<h2>Control and discharge</h2><p>HDDPC drives both small MOSFETs. Each driver pulls its power-switch gate through the existing 51 ohm resistor. The existing 100 kilohm source-to-gate resistor holds the switch off, and the 10 microfarad gate capacitor controls its transition. Each 1 kilohm output resistor drains stored charge after switch-off. The ATX PS_ON resistor link is also routed.</p><img src="controls.png" alt="Top-layer gate, driver and discharge routing for both power switches.">
<h2>Resistive conductor screen</h2><p>The model uses the actual copper and plated barrels at 80 °C, with at least 25% mesh allowance. The two currents are individual rail envelopes; the card must still stay within the 75 W combined budget. Input and output networks are solved separately. MOSFET numbers use 25 °C maximum Rds and require full gate drive.</p><table><tr><th>Rail</th><th>Current</th><th>Copper drop, with allowance</th><th>MOSFET drop at 25 °C</th><th>MOSFET loss at 25 °C</th></tr>{rows}</table><p>This screen does not establish slot voltage compliance: source/cable loss, bridge VCCH consumption, return-path loss and hot MOSFET resistance are not included.</p>
<h2>Validation</h2><p>Native fabrication clearance, shorts, trace style, netlist, component and schematic placement checks pass. The physical audit verifies actual copper and barrels, rather than inferring connectivity from shared schematic nets. PCIe/USB spacing, references, clocks, bucks and earlier distribution checks are rechecked. The standard CLI build reproduces the same 481 routed paths; it remains nonzero because other board nets are unrouted. The placement analyzer retains two orientation hints on earlier parts: R_RST_N belongs to a later routing pass, and C_VDD_28 uses verified pad-to-plane contacts. These hints do not describe a copper collision. See the placement review.</p>
<h2 class="open">Qualification still open</h2><p>Startup/shutdown MOSFET safe operating area, repeated gate-resistor pulses, card capacitance, hot junction temperatures, fault clearing and the filled/capped via process need final qualification. This reference circuit has no active current limit or enforced 75 W limit. The existing bridge 3 A / 8 mV screen remains open.</p><p><a href="layout-audit.json">Physical copper audit</a> · <a href="cli-build-summary.json">CLI build summary</a> · <a href="drc.json">Fabrication checks</a> · <a href="placement-review.json">Placement review</a> · <a href="dc-audit.json">Conductor screen</a> · <a href="../../manufacturing/slot-power-routing/requirements.json">Requirements</a> · <a href="../atx5v-routing/report.html">ATX 5 V feeds</a></p><small>Board SHA-256: <code>{html.escape(sha)}</code></small></main></html>'''
(OUT/'report.html').write_text(page);print(OUT/'report.html')
