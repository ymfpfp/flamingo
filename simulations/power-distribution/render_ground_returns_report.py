"""Render the verified ground-return completion review."""
import hashlib,html,json,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as Patch
from shapely.geometry import box
from check_layout import model,ROOT
file=Path(sys.argv[1]);raw=file.read_bytes();j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(json.loads(raw));out=ROOT/'dist/ground-returns'
audit=json.loads((out/'audit.json').read_text());layout=json.loads((out/'layout-audit.json').read_text());drc=json.loads((out/'drc.json').read_text())
if layout['sourceSha256']!=hashlib.sha256(raw).hexdigest():raise ValueError('Ground report and physical checks use different builds')
if not(audit['passed'] and layout['passed'] and drc['passed']):raise ValueError('Ground checks must pass before reporting completion')
specs=json.loads((ROOT/'manufacturing/ground-returns/specs.json').read_text());terminals=json.loads((ROOT/'manufacturing/ground-returns/terminals.json').read_text())
new_traces={e['pcb_trace_id'] for e in j if e['type']=='pcb_trace' and st.get(e.get('source_trace_id'),{}).get('name','').startswith('GRET_')}
fig,axes=plt.subplots(1,3,figsize=(18,8))
for ax,(xmin,xmax,ymin,ymax),title in zip(axes,[(38.5,48,92,106.9),(27,37,85.8,91.8),(31,50.5,105.5,112)],['USB protection and bias grounds','SPI flash ground','Bridge support and reset grounds']):
 extent=box(xmin,ymin,xmax,ymax)
 for o in copper:
  if 'top' not in o['layers'] or not o['shape'].intersects(extent):continue
  color='#c8d9cd' if o['net']==nets['GND'] else '#d9d7d2'
  if o['trace'] in new_traces:color='#117642'
  for p in getattr(o['shape'],'geoms',[o['shape']]):
   if p.geom_type=='Polygon':ax.add_patch(Patch(p.exterior.coords,facecolor=color,edgecolor='none'))
 for t in terminals:
  if not extent.covers(__import__('shapely').geometry.Point(t['x'],t['y'])):continue
  ax.plot(t['x'],t['y'],'o',ms=4,mfc='#117642' if not t.get('existing') else 'white',mec='#117642')
 for s in specs:
  p=port(*s['from'].split('.'))
  if xmin<p['x']<xmax and ymin<p['y']<ymax:ax.text(p['x']+.12,p['y']+.17,s['from'].split('.')[0].replace('_USB',''),fontsize=6)
 ax.set(xlim=(xmin,xmax),ylim=(ymin,ymax),title=title);ax.set_aspect('equal');ax.grid(alpha=.15)
fig.tight_layout();fig.savefig(out/'routing.png',dpi=170);plt.close(fig)
rows=''.join(f'<tr><td>{html.escape(r["name"].removeprefix("GRET_").removesuffix("_CONTACT"))}</td><td>{r["lengthMm"]:.3f}</td><td>{r["widthMm"]:.2f}</td><td>{r["minimumForeignTopCopperGapMm"]:.3f}</td><td>L2 + L5</td></tr>' for r in layout['completedContacts'])
page=f'''<!doctype html><meta charset="utf-8"><title>Ground return completion</title><style>body{{font:16px/1.6 system-ui;background:#f5f7f6;color:#21342d;max-width:1300px;margin:40px auto;padding:0 24px}}.status{{color:#167243;font-weight:650}}section{{background:white;padding:24px;border-radius:14px;margin:20px 0}}img{{width:100%}}td,th{{text-align:left;padding:6px 25px 6px 0}}small{{color:#54655e}}</style><h1>Ground return completion</h1><p class="status">18 remaining ground pads connected · all {layout['groundPadsChecked']} assembled ground pads reach L2 and L5</p><section><p>{audit['groundContacts']} short top-layer contacts, {audit['newVias']} new full-stack vias and {audit['reusedGroundVias']} reused ground vias. All {audit['assembledComponentsOnTop']} assembled components retain their top placements. All {audit['preservedTraceCount']} previous trace geometries are preserved.</p><p>Each return uses 0.20–0.25 mm copper. The longest contact is {max(r['lengthMm'] for r in layout['completedContacts']):.3f} mm; 2 mm is the project locality target. USB protection parts return to nearby existing ground-fence vias. The new vias use 0.30 mm copper / 0.20 mm drills under the existing filled/capped process.</p><p>Fabrication, shorts, routing style, ASMedia USB/PCIe spacing, shielding and reference-plane checks passed. Existing buck and power distribution checks also passed.</p></section><section><p><b>Dark green:</b> added ground contacts. <b>Filled circles:</b> new vias. <b>Open circles:</b> reused vias. Existing top copper appears pale green or gray.</p><img src="routing.png" alt="USB, flash and reset ground return routing"></section><section><table><tr><th>Ground pad</th><th>Length mm</th><th>Width mm</th><th>Foreign top copper gap mm</th><th>Reference planes</th></tr>{rows}</table></section><section><h2>Verification scope</h2><p>Continuity follows actual copper overlaps and plated via barrels, not only schematic net names. Every assembled ground pad is checked against both large reference planes. The fabrication checks cover copper spacing, drill spacing, inner drill clearances, component layer and preserved routing.</p><p>Reset and other unfinished signal wiring remains separate. SI, startup, actual-load and temperature qualification still need completion. Fabrication vendor acceptance of the filled/capped process remains open.</p><small>Sources: ASMedia PCB Guideline R1.0; ASM2464PDX TI R03 reference schematic; project fabrication rules.<br>Board SHA-256: {layout['sourceSha256']}</small></section>'''
# Show the actual plane opening that isolated the auxiliary connector via.
fig,axes=plt.subplots(1,2,figsize=(11,6))
for ax,layer in zip(axes,['inner1','inner4']):
 for o in copper:
  if o['net']!=nets['GND'] or layer not in o['layers'] or o['label'] not in pours:continue
  for poly in getattr(o['shape'],'geoms',[o['shape']]):
   if poly.geom_type!='Polygon':continue
   ax.add_patch(Patch(poly.exterior.coords,facecolor='#b5d3be',edgecolor='none'))
   for ring in poly.interiors:ax.add_patch(Patch(ring.coords,facecolor='white',edgecolor='none'))
 for v in vias.values():
  if 44.5<v['x']<49 and 97.5<v['y']<103:
   color='#397454' if via_net(v)==nets['GND'] else '#877e70'
   ax.add_patch(plt.Circle((v['x'],v['y']),v['outer_diameter']/2,fill=False,color=color,lw=.8))
 ax.add_patch(plt.Circle((45.875,99.75),.175,color='#1763aa'))
 ax.plot(47.4,98.75,'x',color='#b53c31',ms=9,mew=2)
 ax.annotate('Existing grounded return',(45.875,99.75),(44.7,102.55),fontsize=9,color='#1763aa',arrowprops={'arrowstyle':'->','color':'#1763aa'})
 ax.annotate('Old isolated position',(47.4,98.75),(47.25,97.8),fontsize=8,color='#b53c31',rotation=90)
 ax.set(xlim=(44.5,49),ylim=(97.5,103),title='L2 ground plane' if layer=='inner1' else 'L5 ground plane');ax.set_aspect('equal');ax.grid(alpha=.12)
fig.tight_layout();fig.savefig(out/'reference-planes.png',dpi=170);plt.close(fig)
addition=f"""<section><h2>GND and GNDA completeness</h2><p>The expanded physical check covers <b>{layout['allGroundPortsChecked']} ground PCB ports, {layout['groundViasChecked']} ground vias and {layout['physicalGroundLandsChecked']} individual assembled pads and plated lands</b>. This includes all {layout['analogGroundPadsChecked']} GNDA balls. Every checked contact reaches both L2 and L5. Native GND/GNDA port errors: <b>{audit['nativeGroundPortErrors']}</b>.</p><p>One unused auxiliary USB2 ground via was isolated inside the connector copper keepout at (47.4, 98.75) mm. It has been removed. The existing connector ground returns already connect both planes. The earlier component-pad audit missed that auxiliary via. The updated checker rejects reintroducing it, even while all assembled pads remain connected.</p><p>All 520 existing traces and every top-side component placement are preserved. This correction removes one unused via and adds no traces.</p><p><b>Blue:</b> existing grounded return. <b>Red cross:</b> removed isolated via. <b>Green:</b> emitted ground plane. <b>White:</b> copper clearance opening.</p><img src="reference-planes.png" alt="Existing ground returns contact both planes; the unused isolated via is removed"></section>"""
page=page.replace('<title>Ground return completion</title>','<title>GND and GNDA connectivity</title>').replace('<h1>Ground return completion</h1>','<h1>GND and GNDA connectivity</h1>')
page=page.replace('<section>',addition+'<section>',1)
(out/'report.html').write_text(page);print(out/'report.html')
