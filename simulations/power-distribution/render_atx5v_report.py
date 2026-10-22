"""Render a local review from the validated 5 V feed artifacts."""
import hashlib,html,json,sys
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path as MplPath
from matplotlib.patches import PathPatch,Patch
from shapely.geometry import box,Point
from check_layout import model,ROOT

OUT=ROOT/'dist/atx5v-routing'
file=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'dist/board.circuit.json'
raw=file.read_bytes();sha=hashlib.sha256(raw).hexdigest()
layout=json.loads((OUT/'layout-audit.json').read_text());dc=json.loads((OUT/'dc-audit.json').read_text())
assert layout['passed'] and dc['passed'] and layout['sourceSha256']==sha and dc['sourceSha256']==sha
j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(json.loads(raw))
colors={nets[n]:c for n,c in [('V5V','#e7a026'),('VCCH','#36a283'),('VCCL','#d46565'),('VDD','#4f75bb'),('GND','#9aa8b7')]}
def draw(ax,layer,bounds):
    window=box(*bounds)
    for o in copper:
        if layer not in o['layers'] or not window.intersects(o['shape']):continue
        shape=o['shape'].intersection(window)
        for g in getattr(shape,'geoms',[shape]):
            if g.geom_type!='Polygon':continue
            rings=[g.exterior,*g.interiors]
            paths=[MplPath(list(r.coords),[MplPath.MOVETO]+[MplPath.LINETO]*(len(r.coords)-2)+[MplPath.CLOSEPOLY]) for r in rings]
            ax.add_patch(PathPatch(MplPath.make_compound_path(*paths),facecolor=colors.get(o['net'],'#a283b7'),edgecolor='none',alpha=.9))
    ax.set(xlim=(bounds[0],bounds[2]),ylim=(bounds[1],bounds[3]),aspect='equal',xlabel='X (mm)',ylabel='Y (mm)');ax.grid(alpha=.12)
fig,ax=plt.subplots(figsize=(7,10));draw(ax,'inner3',(0,10,45,78))
for pin in [4,6,21,22,23]:
    p=port('ATX','pin'+str(pin));ax.annotate('pin '+str(pin),(p['x'],p['y']),xytext=(p['x'],p['y']-2.5),fontsize=8,ha='center',arrowprops=dict(arrowstyle='-',lw=.6))
for rail in ['VCCL','VDD']:
    p=port('C_'+rail+'_CIN','pin1');ax.annotate(rail+' input',(p['x'],p['y']),xytext=(p['x']-2,p['y']+3),fontsize=10,ha='center',arrowprops=dict(arrowstyle='->',lw=.8))
ax.set_title('ATX 5 V feed on L4');fig.legend(handles=[Patch(color=colors[nets[n]],label=n) for n in ['V5V','VCCH','VCCL','VDD']],loc='lower center',ncol=4,frameon=False)
fig.tight_layout(rect=(0,.03,1,1));fig.savefig(OUT/'l4-feed.png',dpi=160);plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(12,6))
for ax,rail,bounds in zip(axes,['VCCL','VDD'],[(23,70.7,30,77),(32.6,71.9,39.6,78.2)]):
    draw(ax,'top',bounds)
    for pin,part,label,dy in [('pin1','C_'+rail+'_CIN','Input capacitor',-1),('pin1','C_'+rail+'_HF','HF bypass',.35),('VIN',rail+'_BUCK','VIN',.5)]:
        p=port(part,pin);ax.annotate(label,(p['x'],p['y']),xytext=(p['x']+.5,p['y']+dy),ha='center',fontsize=9,arrowprops=dict(arrowstyle='-',lw=.6))
    for v in vias.values():
        name=st.get(v.get('source_trace_id'),{}).get('display_name','')
        if name.startswith('ATX5V_'+rail+'_'):
            ax.add_patch(plt.Circle((v['x'],v['y']),v['hole_diameter']/2,color='white',zorder=5))
    ax.set_title(rail+' buck: top input copper')
fig.tight_layout();fig.savefig(OUT/'input-contacts.png',dpi=160);plt.close(fig)
rows=''.join(f"<tr><td>{r['rail']} buck</td><td>2 A</td><td>{r['conductorDropMV']:.2f} mV</td><td>{r['withMeshAllowanceMV']:.2f} mV</td><td>100 mV</td></tr>" for r in dc['results'])
stamp=datetime.now(ZoneInfo('America/Los_Angeles')).strftime('%Y-%m-%d %H:%M %Z')
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ATX 5 V feed routing review</title><style>
body{{background:#f5f7fb;color:#17324c;font:16px/1.55 system-ui,sans-serif;margin:0}}main{{max-width:1000px;margin:32px auto;padding:0 24px 60px}}h1{{font-size:30px;line-height:1.2}}h2{{font-size:21px;margin-top:30px}}.card{{background:white;border:1px solid #dae2ec;border-radius:10px;padding:20px}}.pass{{color:#146846}}.open{{color:#8d5109}}img{{display:block;max-width:100%;height:auto;margin:auto;border:1px solid #dce3eb;border-radius:8px}}.feed{{max-width:650px}}table{{width:100%;border-collapse:collapse;background:white}}td,th{{text-align:left;padding:12px;border-bottom:1px solid #dce3eb}}a{{color:#245ca6}}code{{overflow-wrap:anywhere}}
</style><main><h1>ATX 5 V feeds to both buck circuits</h1><p>Validated routing review · {stamp}</p>
<div class="card"><strong class="pass">FEEDS ROUTED · LAYOUT AND RESISTIVE SCREEN PASS</strong><p>All five main ATX 5 V contacts connect to both buck VIN pins, both input capacitors and both HF bypass capacitors. The existing PSU status supply remains connected. The physical audit covers {layout['connectedTerminals']} terminals.</p></div>
<h2>Copper layout</h2><p>A 6 mm L4 feeder divides into short branches, at least 1.8 mm wide. The power copper retains {layout['minimumL4PowerGapMm']:.3f} mm clearance, above the 8 mil (0.2032 mm) guideline. A continuous 15 mil (0.381 mm) minimum-width core joins the source and branch contacts.</p>
<p>Each buck input capacitor has two full-stack vias with 0.4 mm drills and 0.8 mm copper lands. Short 0.8 mm top contacts join the capacitor pads. Vias use the existing filled and capped process. The local VIN/HF loops, feedback, enable wiring and all 326 earlier trace paths remain fixed. All 153 assembled components retain their top-side positions.</p>
<img class="feed" src="l4-feed.png" alt="Orange ATX 5 V copper on L4. The shared feeder joins the ATX 5 V contacts and divides into two short branches to the buck input capacitors.">
<img src="input-contacts.png" alt="Top copper at both buck inputs. Two plated power vias sit at each input-capacitor positive pad; the existing local input bypass loops remain fixed.">
<p>White circles in the close-ups mark drill locations. These power vias use the specified filled and capped process.</p>
<h2>Input voltage-drop screen</h2><p>The model applies 2 A at each VIN pin, 4 A combined, with copper at 80 °C. It uses the emitted top and L4 copper, drill openings and plated power-via barrels. The allowance includes at least 25 percent for mesh and contact approximation. The 100 mV budget is a project sizing criterion, not an ASMedia specification.</p>
<table><thead><tr><th>Load</th><th>Input current</th><th>Conductor drop</th><th>With allowance</th><th>Budget</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Validation</h2><p>Fabrication clearances, netlist, component placement, schematic placement and trace continuity pass. The copper check finds no floating 5 V power regions. Native shorts and PCB style checks pass. Existing PCIe, USB, clock, buck and bridge-power checks pass.</p>
<p>The L4 branches reserve small areas near the lower power-region edges. The separate VCCL/VDD 3 A / 8 mV screen remains unchanged and open. Other board connections still need routing.</p>
<h2 class="open">Electrical qualification remains open</h2><p>This is a layout and conductor-resistance review. Connector/cable loss, ground-return loss, input ripple, load transients, startup, fault protection, temperatures and manufacturer process acceptance require separate qualification.</p>
<p><a href="layout-audit.json">Physical copper audit</a> · <a href="dc-audit.json">Input DC screen</a> · <a href="../validation/board.json">Board validation</a> · <a href="../../manufacturing/atx5v-routing/requirements.json">Requirements</a> · <a href="../vcch-routing/report.html">Bridge 3.3 V review</a></p>
<small>Board-build SHA-256: <code>{html.escape(sha)}</code></small></main></html>'''
(OUT/'report.html').write_text(page);print(OUT/'report.html')
