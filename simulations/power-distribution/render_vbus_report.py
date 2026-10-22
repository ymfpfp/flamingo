"""Render a review of the validated VBUS geometry and scope."""
import hashlib,html,json,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as Patch
from check_layout import model,ROOT
from validation_report import validation_report
file=Path(sys.argv[1]);raw=file.read_bytes();j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(json.loads(raw));out=ROOT/'dist/vbus-routing'
validation=validation_report(file, 'vbus');audit=validation['vbus:auditVbusRouting'];drc=validation['drc'];layout=json.loads((out/'layout-audit.json').read_text())
if layout['sourceSha256']!=hashlib.sha256(raw).hexdigest():raise ValueError('Report and physical checks use different builds')
if not(audit['passed'] and layout['passed'] and drc['passed']):raise ValueError('VBUS checks must pass before reporting completion')
fig,axes=plt.subplots(1,3,figsize=(18,6.6))
for ax,layer in zip(axes,['top','inner2','bottom']):
 for o in copper:
  if layer not in o['layers']:continue
  bounds=o['shape'].bounds
  if not bounds or bounds[0]>48 or bounds[2]<33 or bounds[1]>106 or bounds[3]<94:continue
  color='#d7dddc';alpha=.6
  if o['net']==nets['USB_VBUS']:color='#df7f18';alpha=1
  elif o['net']==nets['USB_VBUS_SENSE']:color='#9c42b8';alpha=1
  elif o['net']==nets['GND']:color='#a7c9b4';alpha=.6
  for p in getattr(o['shape'],'geoms',[o['shape']]):
   if p.geom_type=='Polygon':
    ax.add_patch(Patch(list(p.exterior.coords),facecolor=color,edgecolor='none',alpha=alpha))
    for ring in p.interiors:ax.add_patch(Patch(list(ring.coords),facecolor='white',edgecolor='none'))
 for part,pin,label in [('R_VBUS_TOP','pin1','4.7k input'),('R_VBUS_BOTTOM','pin1','10k divider'),('C_VBUS_SENSE','pin1','1uF filter'),('ASM2464PDX','G1','G1 / VBUS')]:
  p=port(part,pin);ax.text(p['x']-.05,p['y']+.23,label,fontsize=7,color='#402654')
 ax.set_xlim(33,48);ax.set_ylim(94,106);ax.set_aspect('equal');ax.set_title({'top':'L1 · all components','inner2':'L3 · VBUS / filtered sense','bottom':'L6 · existing USB data'}[layer]);ax.grid(alpha=.16)
fig.tight_layout();fig.savefig(out/'routing.png',dpi=170);plt.close(fig)
gaps=[r['minimumForeignCopperGapMm'] for r in layout['routes'] if r['minimumForeignCopperGapMm'] is not None]
rows=''.join('<tr><td>'+html.escape(r['net'])+'</td><td>'+str(len(r['terminals']))+'</td><td>Connected</td></tr>' for r in layout['connectivity'])
page=f'''<!doctype html><meta charset="utf-8"><title>USB VBUS sensing routing</title><style>body{{font:16px/1.6 system-ui;background:#f5f7f6;color:#21342d;max-width:1200px;margin:40px auto;padding:0 24px}}h1{{margin-bottom:0}}.status{{color:#167243;font-weight:650}}section{{background:white;padding:24px;border-radius:14px;margin:20px 0}}img{{width:100%}}td,th{{text-align:left;padding:8px 25px 8px 0}}small{{color:#54655e}}</style><h1>USB VBUS sensing</h1><p class="status">Layout and physical connectivity checks passed</p><section><p>All four USB-C VBUS contacts feed the existing 4.7 kΩ / 10 kΩ divider. The 1 µF filter connects to bridge G1. All four connector ground pins and both divider/filter ground pads reach the ground planes.</p><p>21 native fixed connections · {audit['newVias']} added full-stack vias · {validation['layout']['preservedTraceCount']} previous traces preserved · all {audit['assembledComponentsOnTop']} assembled components remain on top.</p><table><tr><th>Network</th><th>Checked pads</th><th>Result</th></tr>{rows}</table><p>ASMedia VBUS rule: width ≥ 0.127 mm (5 mil), spacing ≥ 0.2032 mm (8 mil), length ≤ 254 mm. Nominal routing width is 0.15 mm. Measured minimum signal-wire clearance: {min(gaps):.4f} mm. Main sensing paths use L3, with short top pad connections. L2/L5 remain the ground references.</p></section><section><p><b>Orange:</b> cable VBUS. <b>Purple:</b> filtered sense. <b>Green:</b> ground. <b>Gray:</b> existing copper.</p><img src="routing.png" alt="Top, L3 and bottom copper around USB VBUS sensing"></section><section><h2>Verification scope</h2><p>Native build, netlist and placement checks; fabrication geometry; physical copper/barrel connectivity; ASMedia VBUS geometry; USB/PCIe isolation and reference-plane checks; native shorts and routing-style checks.</p><p>Powered-off sensing, protection, bridge thresholds and system startup qualification remain open. Other board signals still need routing; assembled ground returns are checked separately by check:grounds. Manufacturer acceptance of the filled/capped BGA via process remains pending.</p><small>Board SHA-256: {layout['sourceSha256']}<br>Sources: ASMedia PCB Guideline R1.0 VBUS table; ASM2464PDX TI R03 sheet 3; project fabrication rules. This is a layout review, not hardware qualification.</small></section>'''
(out/'report.html').write_text(page);print(out/'report.html')
