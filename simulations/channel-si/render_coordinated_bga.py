"""Source-bound report and copper views for the coordinated TX3 redesign."""
from pathlib import Path
from collections import Counter
import hashlib
import html
import json
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as Patch, Circle
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'dist/si-channel-review/tx3-coordinated'
sys.path.insert(0,str(ROOT/'simulations/pcie-tx'))
from copper_geometry import copper_objects

def load(p): return json.loads(Path(p).read_text())
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def channel(board,lane):
    sc=next(e['source_component_id'] for e in board if e['type']=='source_component' and e['name']=='ASM2464PDX')
    balls=[['R20','R21'],['U20','U21'],['Y17','AA17'],['Y15','AA15']][lane]
    out=[]
    for ball in balls:
        sp=next(e for e in board if e['type']=='source_port' and e.get('source_component_id')==sc and ball in e.get('port_hints',[]))
        pp=next(e for e in board if e['type']=='pcb_port' and e.get('source_port_id')==sp['source_port_id'])
        trace=next(e for e in board if e['type']=='pcb_trace' and e['route'][0]['route_type']=='wire' and any(p['route_type']=='via' for p in e['route']) and
                   abs(e['route'][0]['x']-pp['x'])<1e-7 and abs(e['route'][0]['y']-pp['y'])<1e-7)
        pad=next(e for e in board if e['type']=='pcb_smtpad' and e.get('pcb_port_id')==pp['pcb_port_id'])
        out.append((trace,pad))
    return out

def paint(ax,shape,color,alpha=1,z=1):
    for p in [shape] if shape.geom_type=='Polygon' else getattr(shape,'geoms',[]):
        if p.geom_type=='Polygon' and not p.is_empty:
            ax.add_patch(Patch(list(p.exterior.coords),facecolor=color,edgecolor='none',alpha=alpha,zorder=z))

def annotation(ax,label,xy,at,color='#263440'):
    ax.annotate(label,xy=xy,xytext=at,fontsize=11,color=color,ha='left',va='center',zorder=20,
        bbox=dict(boxstyle='round,pad=.35',fc='white',ec='#c9d1d9',alpha=.97),
        arrowprops=dict(arrowstyle='->',lw=1.4,color=color))

def views(before,after):
    fig,axes=plt.subplots(1,2,figsize=(15,6.6),dpi=170)
    colors=['#d23f32','#2167b0'];region=box(26.98,100.65,30.5,102.72)
    for ax,board,title in zip(axes,[before,after],['Before: different ball transitions','After: matching lands and via-in-pad transitions']):
        objs=copper_objects(board)
        for obj in objs:
            if 'top' in obj['layers'] and not obj['label'].startswith('pcb_copper_pour') and obj['shape'].intersects(region):
                paint(ax,obj['shape'].intersection(region),'#d8dee4',.72)
        for (trace,pad),color in zip(channel(board,3),colors):
            for obj in objs:
                if obj['trace']==trace['pcb_trace_id'] and 'top' in obj['layers'] and obj['shape'].intersects(region):
                    paint(ax,obj['shape'].intersection(region),color,1,5)
            paint(ax,copper_objects([pad])[0]['shape'],color,1,6)
            v=next(p for p in trace['route'] if p['route_type']=='via')
            ax.add_patch(Circle((v['x'],v['y']),.125,fc=color,ec='white',lw=.6,zorder=8))
            ax.add_patch(Circle((v['x'],v['y']),.075,fc='white',ec=color,lw=.7,zorder=9))
            if board is after:
                ax.plot([v['x'],v['x']+.19],[v['y'],v['y']],color=color,ls='--',lw=2,zorder=7)
        if board is before:
            annotation(ax,'P: 3.081 mm on top\nbefore this via',(30.1,101.0400074),(28.72,100.85),colors[0])
            annotation(ax,'N: via already at the ball',(27.66,102.0000074),(27.08,102.48),colors[1])
        else:
            annotation(ax,'P: via at Y15',(27.66,101.5400074),(27.08,100.94),colors[0])
            annotation(ax,'N: via at AA15',(27.66,102.0000074),(27.08,102.48),colors[1])
            ax.text(28.4,101.68,'Both lands: Ø0.25 mm\nBoth drills: Ø0.15 mm\nBoth top escapes: 0 mm',fontsize=11,
                    bbox=dict(boxstyle='round,pad=.45',fc='white',ec='#c9d1d9'),zorder=15)
        ax.set_xlim(26.98,30.5);ax.set_ylim(100.65,102.72);ax.set_aspect('equal')
        ax.set_title(title,fontsize=14,pad=12);ax.set_xlabel('Board X (mm)');ax.set_ylabel('Board Y (mm)');ax.grid(alpha=.13)
    fig.suptitle('PCIe TX3 — actual PCB top copper and via locations',fontsize=19,weight='bold',y=.96)
    fig.text(.5,.09,'Red = P · blue = N · dashed = first 0.19 mm on bottom · via symbols show drill locations; vias require filling/capping.',ha='center',fontsize=10)
    fig.text(.5,.045,'Symmetry is at the ball lands, barrels, layer changes and first horizontal runs. Bottom fan-in and length compensation remain different.',ha='center',fontsize=10)
    fig.subplots_adjust(left=.055,right=.98,top=.82,bottom=.17,wspace=.18)
    fig.savefig(OUT/'tx3-before-after.png');plt.close(fig)

    fig,axes=plt.subplots(1,2,figsize=(15,9),dpi=160)
    region=box(24.1,98.25,33.15,104.25)
    palette=['#a34a8c','#ba6b25','#087e8b']
    for ax,board,title in zip(axes,[before,after],['Before','Coordinated redesign']):
        objects=copper_objects(board)
        for obj in objects:
            if 'bottom' in obj['layers'] and not obj['label'].startswith('pcb_copper_pour') and obj['shape'].intersects(region):
                paint(ax,obj['shape'].intersection(region),'#dce1e6',.75)
        for lane,color in zip([1,2,3],palette):
            ids={t['pcb_trace_id'] for t,_ in channel(board,lane)}
            for obj in objects:
                if obj['trace'] in ids and 'bottom' in obj['layers'] and obj['shape'].intersects(region):
                    paint(ax,obj['shape'].intersection(region),color,1,5)
            ax.plot([],[],color=color,lw=4,label=f'TX{lane}')
        ax.set_xlim(24.1,33.15);ax.set_ylim(98.25,104.25);ax.set_aspect('equal')
        ax.set_title(title,fontsize=16);ax.set_xlabel('Board X (mm)');ax.set_ylabel('Board Y (mm)');ax.grid(alpha=.14);ax.legend(loc='upper left')
    fig.suptitle('Coordinated bottom-layer escape routing',fontsize=20,weight='bold',y=.94)
    fig.text(.5,.07,'Actual copper geometry; other traces and vias muted. Reference planes are not displayed. All checked trunk widths, gaps and isolation limits are retained.',ha='center',fontsize=10)
    fig.subplots_adjust(left=.06,right=.98,top=.84,bottom=.14,wspace=.18)
    fig.savefig(OUT/'bottom-before-after.png');plt.close(fig)

def table(head,rows):
    e=lambda s:html.escape(str(s))
    return '<div class="scroll"><table><tr>'+''.join('<th>'+e(s)+'</th>' for s in head)+'</tr>'+''.join('<tr>'+''.join('<td>'+e(s)+'</td>' for s in row)+'</tr>' for row in rows)+'</table></div>'

def main():
    before=load(OUT/'before.circuit.json');after=load(OUT/'after.circuit.json');digest=sha(OUT/'after.circuit.json')
    g=load(OUT/'geometry.json');native=load(OUT/'native-checks.json');preserve=load(OUT/'preservation.json')
    domain=load(OUT/'domain-audits.json');package=load(OUT/'package-bga.json');ground=load(OUT/'ground-reference-verification.json')
    model=load(OUT/'component-tline-results.json');spacing=load(OUT/'pcie-spacing.json');support=load(OUT/'pcie-reference.json')
    assert all(v==digest for v in [g['sourceSha256'],native['sourceSha256'],preserve['sourceSha256'],domain['sourceSha256'],package['provenance']['sourceSha256'],ground['sourceSha256'],model['sourceSha256']])
    assert native['passed'] and preserve['passed'] and domain['passed'] and ground['passed'] and spacing['passed'] and support['passed']
    assert all(v['passed'] for v in g['audits'].values()) and all(v['passed'] for v in model['numericChecks'])
    assert not any(c['status']=='fail' for c in package['checks'])
    for fn,token in [('usb-layout.log','True'),('usb-reference.log','True'),('clock-layout.log','True'),('shorts.log','No shorts detected'),('pcb-style.log','No PCB style issues detected')]:
        assert token in (OUT/fn).read_text(),fn
    assert '0 fail' in (OUT/'tests.log').read_text()
    assert sha(ROOT/'lib/pcie-connector-routing.ts')==load(OUT/'before-sources.json')['lib/pcie-connector-routing.ts']
    input_checks=[]
    for name,expected in model['inputSha256'].items():
        p=Path(name);p=p if p.is_absolute() else ROOT/p
        assert sha(p)==expected,str(p)
        input_checks.append({'file':str(p),'sha256':expected})
    views(before,after)
    warnings=Counter(x['rule'] for x in native['drc']['findings'] if x['severity']=='warning')
    rows=[]
    for c in g['channels']:
        lengths=[v['lengthMm'] for v in c['conductors']]
        rows.append([c['name'],'PASS',f'{lengths[0]:.6f} / {lengths[1]:.6f}',f'{abs(lengths[0]-lengths[1]):.8f}',
                     'Coordinated launch edit' if c['name'] in ['PCIE_TX1','PCIE_TX2','PCIE_TX3'] else 'Route copper preserved'])
    files=[OUT/f for f in ['before.circuit.json','after.circuit.json','geometry.json','field-solver-handoff.json','selected.json',
        'native-checks.json','route-audits.json','domain-audits.json','preservation.json','package-bga.json','ground-reference-verification.json',
        'pcie-spacing.json','pcie-reference.json','component-tline-results.json','USB4-neck-cross-sections.json','nominal-cross-sections.json',
        'tests.log','shorts.log','pcb-style.log','placement.log','schematic-placement.log','usb-layout.log','usb-reference.log','clock-layout.log',
        'tx3-before-after.png','bottom-before-after.png']]
    files += [ROOT/f for f in ['README.md','lib/pcie-tx-routing.ts','lib/bridge-clock-routing.tsx','imports/ASM2464PDX.tsx',
        'manufacturing/power-distribution/bga-escapes.json','manufacturing/power-distribution/terminals.json',
        'manufacturing/bridge-bga/process.json','manufacturing/bridge-bga/tx3-rework.json',
        'tests/audits/pcie-tx-routing-audit.ts','tests/audits/bridge-bga-review.mjs','tests/audits/layout-audit.mjs',
        'tests/pcie-routing.test.jsx','tests/bridge-bga-process.test.jsx','scripts/prepare-channel-review.mjs',
        'simulations/channel-si/verify_coordinated_preservation.mjs','simulations/channel-si/audit_package_bga.py']]
    files.append(Path(__file__))
    result={'sourceSha256':digest,'beforeSourceSha256':sha(OUT/'before.circuit.json'),
        'allRequiredRoutingChecksPassed':True,'pcieConnectorPreserved':True,'preservation':preserve['checks'],
        'unchangedRoutedTraces':preserve['unchangedRouteCount'],'changedRoutes':12,
        'symmetricScope':'Both TX3 lands/mask openings, via barrels, layer transitions, zero top escape and first 0.19 mm horizontal bottom segments match. Subsequent bottom fan-in and P length compensation are not mirror images.',
        'nativeDrcErrors':0,'nativeDrcWarnings':dict(warnings),'nativeNetlistFindings':len(native['netlist']),
        'nativeContinuityFindings':len(native['continuity']),'dataChannels':12,'passiveModelScenarios':len(model['cases']),
        'passiveNumericalChecks':len(model['numericChecks']),'groundBallsConnected':96,'groundViasContactingBothPlanes':ground['groundViaCount'],
        'placementAdvisory':'Pre-existing C_VDD_28 orientation heuristic remains; assembled placement is unchanged, native placement DRC has zero errors/warnings and Gerber shorts are clear.',
        'fullChannelEyeBERQualified':False,'native3DExtractionRerun':False,
        'limits':['ASMedia package/PHY and actual mated connector models remain unavailable.','Filled/capped via-in-pad and revised matched lands/mask/stencil still require vendor process acceptance.',
                  'Numerically valid passive TL cases are assumed scenarios, not physical bounds or a compliance pass.'],
        'files':[{'file':str(p.relative_to(ROOT)),'sha256':sha(p)} for p in files],'modelInputFilesVerified':input_checks}
    (OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    e=html.escape
    page='''<!doctype html><html><head><meta charset="utf-8"><title>Coordinated TX3 BGA redesign</title><style>body{font:16px/1.55 system-ui;color:#21313d;max-width:1150px;margin:36px auto;padding:0 24px}h1{font-size:31px}h2{font-size:23px;margin-top:32px}.status{background:#eaf5f0;padding:18px;border-radius:9px}img{max-width:100%;height:auto;border:1px solid #d7dfe4;border-radius:6px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d7dfe4;text-align:left;padding:9px}code{overflow-wrap:anywhere;font-size:13px}a{color:#176499}small{color:#556875}</style></head><body><h1>Coordinated TX3 BGA redesign</h1><p class="status"><b>Applied and checked.</b> Both TX3 balls now use matching Ø0.25 mm circular lands, 0.025 mm mask margins, and Ø0.15 mm drill / Ø0.25 mm copper filled/capped land vias. Both top escapes are zero. All 12 data channels pass the current routing checks; the PCIe connector geometry is unchanged.</p><h2>What is symmetric</h2><p>The matching covers the ball lands, mask openings, via barrels, layer transitions and first 0.19 mm horizontal bottom runs. Later bottom fan-in and P length compensation remain different so that the complete routed P/N lengths match through the existing bends. No internal package-delay matching is inferred.</p><img src="tx3-before-after.png" alt="TX3 before and after top copper and land vias"><h2>Coordinated changes</h2><p>TX1 and TX2 launch sections were adjusted to clear the new TX3 land via and retain checked trunk spacing. Four local GND contacts were re-tapped to existing returns and one redundant GND via was retired. A nearby ground return moved 0.10 mm and one clock return moved 0.20 mm; both REFCLK bridge vias moved 0.10 mm. No CC2 signal route was changed. All assembled component placements are unchanged and top-only.</p><img src="bottom-before-after.png" alt="Coordinated bottom routing before and after"><p>Exact comparison confirms <b>625 other routed traces are preserved</b>. Twelve routes changed: six TX1/TX2/TX3 bridge conductors, two REFCLK bridge routes and four GND contacts. Only the Y15/AA15 solder lands changed. All PCIe connector lands and signal entries are preserved.</p><h2>All-channel checks</h2>'''
    page+=table(['Channel','Routing check','P / N drawn length (mm)','Planar skew (mm)','Change'],rows)
    page+='''<p>PCIe and USB4 isolation, trace-width reference-plane support and clock coupled geometry/isolation/reference checks pass without relaxing the existing limits. Both reference planes remain single connected copper regions; all 269 logically resolved GND vias touch both planes. All 96 package GND/GNDA balls connect physically to both references. There are no unused signal-via barrel tails in the checked top-to-bottom paths.</p><h2>Native and regression verification</h2><ul><li>Full native routed DRC: <b>0 errors</b>; 234 warnings remain, comprising existing requested-width notices and the BGA manufacturing-process review notice.</li><li>Native netlist and continuity: zero findings. Gerber-derived shorts: none. PCB style: no issues. Schematic placement: no issues.</li><li>12 selected PCB/BGA tests pass, including rejection of unequal TX3 lands and an equal-length but asymmetric via escape.</li><li>Assembly, locked-route preservation, PDN, ground-return, USB2, buck, VCCH, ATX5V, slot-power and VBUS geometry audits pass.</li><li>The pre-existing C_VDD_28 orientation heuristic remains. Native placement DRC has zero errors/warnings; component placements are identical to the starting board. No unrelated capacitor rotation was made.</li></ul><h2>Passive SI screen</h2><p>The uniform selected-stackup sections were recomputed, followed by all 216 reduced passive channel scenarios. All seven numerical checks pass, including passivity, reciprocity and analytic controls. These models do not extract finite 3D via/launch fields or predict a complete-channel eye/BER result. The actual package/PHY and connector models remain unavailable.</p><h2>Remaining acceptance</h2><p>The revised matching lands, mask, stencil and filled/capped via construction remain pending vendor DFM/DFA acceptance. This report confirms the checked geometry and numerical models; it does not declare complete-channel compliance or production release.</p><p>Current PCB SHA256: <code>'''+digest+'''</code></p><h2>Evidence</h2><p><a href="results.json">Combined result and input hashes</a> · <a href="preservation.json">Exact routing and pad preservation</a> · <a href="native-checks.json">Full native checks</a> · <a href="pcie-spacing.json">PCIe isolation</a> · <a href="pcie-reference.json">PCIe reference support</a> · <a href="package-bga.json">Package/BGA physical audit</a> · <a href="ground-reference-verification.json">GND-plane connectivity</a> · <a href="component-tline-results.json">216 passive scenarios</a> · <a href="tests.log">Regression tests</a></p></body></html>'''
    (OUT/'report.html').write_text(page)
    print(json.dumps({'sourceSha256':digest,'allRequiredRoutingChecksPassed':True,'report':str(OUT/'report.html'),'boundFiles':len(files)}))

if __name__=='__main__': main()
