"""Render the checked slot 3.3 V rework and all-supply screening results."""
import hashlib
import html
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'dist/slot-3v3-rework-2026-10-27'
def read(path): return json.loads(path.read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def plot():
    import matplotlib
    matplotlib.use('Agg')
    from matplotlib import pyplot as plt
    from matplotlib.path import Path as MPath
    from matplotlib.patches import PathPatch, Patch
    from shapely.geometry.polygon import orient
    from shapely.ops import unary_union
    sys.path.insert(0,str(ROOT/'simulations/power-distribution'))
    from check_layout import model
    colors={'SLOT_3V3':'#25816d','SLOT_12V':'#b99a29','VCCL':'#ce743a','VDD':'#b5516b','VCCH':'#6b66a0'}
    fig,axes=plt.subplots(2,2,figsize=(11,12),layout='constrained')
    for col,(file,title) in enumerate([('before.circuit.json','Before'),('final2.circuit.json','Revised')]):
        m=model(read(OUT/file))
        for row,layer in enumerate(['bottom','inner3']):
            ax=axes[row,col]
            for name,color in colors.items():
                geom=unary_union([o['shape'] for o in m[7] if o['net']==m[8][name] and layer in o['layers']])
                for poly in getattr(geom,'geoms',[geom]):
                    if poly.geom_type!='Polygon' or poly.is_empty:continue
                    vertices,codes=[],[]
                    for ring in [orient(poly,sign=1).exterior,*orient(poly,sign=1).interiors]:
                        xy=list(ring.coords);vertices+=xy;codes += [MPath.MOVETO]+[MPath.LINETO]*(len(xy)-2)+[MPath.CLOSEPOLY]
                    ax.add_patch(PathPatch(MPath(vertices,codes),facecolor=color,edgecolor='none'))
            for via in m[5].values():
                if m[10](via)==m[8]['SLOT_3V3']:
                    ax.plot(via['x'],via['y'],'o',ms=2,color='#082f25')
            ax.set(xlim=(0,36),ylim=(110,68),aspect='equal',title=title+' — '+('bottom' if layer=='bottom' else 'L4'),xlabel='X (mm)',ylabel='Y (mm)')
            ax.grid(alpha=.15)
    fig.legend(handles=[Patch(color=c,label=n) for n,c in colors.items()],loc='outside lower center',ncol=5)
    fig.savefig(OUT/'power-copper.png',dpi=150);plt.close(fig)

def render():
    board=OUT/'final2.circuit.json';digest=sha(board)
    copies={'validation.json':'dist/validation/board.json','core-dc.json':'dist/power-distribution/dc-audit.json',
            'slot-dc.json':'dist/slot-power-routing/dc-audit.json','atx5v-dc.json':'dist/atx5v-routing/dc-audit.json',
            '3v3-dc.json':'dist/vcch-routing/dc-audit.json'}
    for target,source in copies.items():
        obj=read(ROOT/source);assert obj['sourceSha256']==digest,(source,'stale result')
        (OUT/target).write_bytes((ROOT/source).read_bytes())
    validation,core,slot,five,three=[read(OUT/n) for n in ['validation.json','core-dc.json','slot-dc.json','atx5v-dc.json','3v3-dc.json']]
    assert validation['passed'] and three['passed'] and five['passed']
    external=read(OUT/'bridge-and-external-dc.json');assert external['sourceSha256']==digest and external['passed']
    preserve=read(OUT/'preservation.json');assert preserve['passed'] and preserve['sourceSha256']==digest
    tests=(OUT/'tests2.log').read_text();assert '171 pass' in tests and '0 fail' in tests
    dynamics=read(OUT/'power/results.json');assert dynamics['sourceSha256']==digest and all(c['passed'] for c in dynamics['numericChecks'])
    planned=read(ROOT/'simulations/power-dynamics/provisional-loads.json')['rails']
    rows=[]
    for r in core['results']:
        amps=planned[r['rail']]['designCurrentA'];loss=r['screeningUpperDropMV']*amps/r['currentA']
        rows.append(dict(rail=r['rail'],loadA=amps,conductorLossMV=loss,limitMV=8,passed=loss<=8))
    assert all(r['passed'] for r in rows)
    summary=three['summary'];channel12=next(c for c in slot['channels'] if c['rail']=='12V')
    twelve_loss=channel12['conductorUpperDropMV']+channel12['mosfetDrop25CMaxRdsMV']
    twelve=dict(loadA=5.5,conductorLossMV=channel12['conductorUpperDropMV'],
                lossIncluding25CFetMV=twelve_loss,voltageAt11p4VInput=11.4-twelve_loss/1000,
                voltageAt11p2VInput=11.2-twelve_loss/1000,slotMinimumV=11.04,
                minimumInputBeforeUnmodeledLossesV=11.04+twelve_loss/1000,
                qualified=False)
    paths=['manufacturing/stackup/selected.json','manufacturing/power-distribution/cost-reduction-copper.json',
           'manufacturing/power-distribution/surface-si-moats.json','manufacturing/slot-power-routing/regions.json',
           'manufacturing/slot-power-routing/surface-regions.json','manufacturing/slot-power-routing/terminals.json',
           'manufacturing/vcch-routing/regions.json','scripts/validate-board.mjs','simulations/power-distribution/check_3v3_dc.py',
           'simulations/power-distribution/check_slot_dc.py','simulations/power-distribution/prepare_surface_moats.py',
           'scripts/prepare-slot3v3-rework-stitches.mjs','simulations/power-distribution/check_slot_stitch_sites.py',
           'scripts/render-slot3v3-rework-review.py']
    report=dict(dateLocal='2026-10-27',status='Slot 3.3 V DC repair checked; full power qualification remains open',
                sourceFile=str(board.relative_to(ROOT)),sourceSha256=digest,stackupCode=slot['stackupCode'],
                hardwareQualified=False,corePlannedLoads=rows,slot3V3=summary,slot12V=twelve,
                atx5V=five['results'],bridgeAndExternalLoadsPassed=external['passed'],
                preservation=preserve,tests=dict(passed=171,skipped=8,failed=0),
                inputSha256={p:sha(ROOT/p) for p in paths},
                openItems=['VDD conditional load-step failures persist; no validated TPS62903 closed-loop model.',
                           '12 V does not meet the slot floor at the ATX 3.x 11.2 V minimum in this conductor-plus-25 C FET model.',
                           'Ground return, mating contacts, guaranteed hot MOSFET resistance, ripple and transients remain outside the slot DC screen.',
                           'Accepted bridge currents are project assumptions, not manufacturer maxima. VCCL 3 A stress criterion remains open.',
                           'JLCPCB BGA, via, mask and stencil acceptance and hardware measurements remain open.'])
    (OUT/'review.json').write_text(json.dumps(report,indent=2)+'\n')
    (ROOT/'manufacturing/slot-3v3-rework-review-2026-10-27.json').write_text(json.dumps(report,indent=2)+'\n')
    table=''.join(f'<tr><td>{r["rail"]}</td><td>{r["loadA"]:g} A</td><td>{r["conductorLossMV"]:.2f} mV</td><td>Below 8 mV planned-load target</td></tr>' for r in rows)
    table+=''.join(f'<tr><td>5 V input to {r["rail"]}</td><td>{r["inputCurrentA"]:g} A</td><td>{r["withMeshAllowanceMV"]:.2f} mV</td><td>Below 100 mV conductor target</td></tr>' for r in five['results'])
    table+=f'<tr><td>Slot 3.3 V output copper</td><td>3 A</td><td>{summary["slotOutputCopperUpperMV"]:.2f} mV</td><td>Was 78.27 mV</td></tr><tr><td>Slot 12 V input + output copper</td><td>5.5 A</td><td>{twelve["conductorLossMV"]:.2f} mV</td><td>Full voltage margin remains open</td></tr>'
    issues=''.join('<li>'+html.escape(s)+'</li>' for s in report['openItems'])
    (OUT/'report.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Flamingo — 3.3 V slot repair</title><style>body{{font:17px/1.55 system-ui;max-width:1000px;margin:40px auto;padding:0 24px;color:#172b36}}h1,h2{{line-height:1.2}}table{{border-collapse:collapse;width:100%}}td,th{{text-align:left;padding:10px;border-bottom:1px solid #ccd6d9}}img{{width:100%}}.open{{background:#fff1cf;padding:16px;border-left:5px solid #b67917}}code{{overflow-wrap:anywhere}}a{{color:#086b78}}</style>
<h1>Slot 3.3 V repair on the cheaper stackup</h1><p>Checked board: JLC06161H-3313, 1 oz outer copper and 0.5 oz inner copper. Eight added full-stack vias. All 154 parts stay on top, at their original positions. All 638 trace geometries are unchanged.</p>
<p>The slot 3.3 V output has wider L4 copper and a parallel bottom path. The shared input neck is wider. The existing 12 V bottom feed stays in place.</p>
<h2>3.3 V at a low PSU voltage</h2><p>At 3 A slot current and the 100 mA bridge allowance, the model predicts <b>{summary['slot3AAndBridge100mA_slotDropIncluding25CFetMV']:.2f} mV</b> total loss, including the switch at its 25°C maximum resistance. From a 3.135 V input, the slot receives <b>{summary['slotVoltageFromATXMinus5PercentV']:.4f} V</b>, versus a 3.003 V floor. That leaves <b>{summary['slotMarginFromATXMinus5PercentMV']:.2f} mV</b> before the unmodeled losses.</p>
<p>Doubling the switch resistance leaves {summary['slotMarginWith2xFetResistanceSensitivityMV']:.2f} mV. This is a sensitivity case, not a guaranteed hot-resistance bound. The separate bridge screen also passes with flash, supervisor and pull-up allowances and a 50 mΩ analog jumper.</p>
<h2>All supplies rechecked</h2><p>Conductor results assume 80°C copper and include the existing mesh allowance. They exclude ground-return and mating-contact loss.</p><table><tr><th>Path</th><th>Load</th><th>Copper loss</th><th>Result</th></tr>{table}</table>
<p class="open"><b>The board is not released for ordering.</b> The 12 V model gives {twelve['voltageAt11p2VInput']:.4f} V at an 11.2 V input, below the 11.04 V slot floor. VDD load-change failures also remain. Passing layout checks does not close these power issues.</p>
<h2>Checks</h2><p>Full board validation passes, including connectivity, clearances, shorts, PCB style, reference planes and high-speed isolation. 171 tests pass; 8 existing optional-fixture tests are skipped. Type checking passes. Placement has zero DRC errors and warnings; its existing C_VDD_28 orientation advisory is unchanged and was assessed against the real vertical pad connections.</p>
<img src="power-copper.png" alt="Actual bottom and L4 power copper before and after the slot 3.3 V repair">
<h2>Open power work</h2><ul>{issues}</ul>
<h2>Evidence</h2><p><a href="final2.circuit.json">Checked board</a> · <a href="review.json">Review and source hashes</a> · <a href="validation.json">Board validation</a> · <a href="3v3-dc.json">Shared 3.3 V screen</a> · <a href="bridge-and-external-dc.json">Bridge and external loads</a> · <a href="core-dc.json">Core supplies</a> · <a href="slot-dc.json">Slot supplies</a> · <a href="atx5v-dc.json">5 V inputs</a> · <a href="power/results.json">Core supply response</a> · <a href="preservation.json">Layout preservation</a></p>
<p>Voltage limits: <a href="https://edc.intel.com/content/www/us/en/design/ipla/software-development-platforms/client/platforms/alder-lake-desktop/atx-version-3-0-multi-rail-desktop-platform-power-supply-design-guide/2.0/2.1/dc-voltage-regulation-required/">Intel ATX guide</a>; <a href="https://www.ti.com/lit/ds/symlink/tps2363.pdf">TI PCIe CEM requirements, Table 1</a>.</p><p><code>Board SHA-256: {digest}</code></p></html>''')

plot()
if '--plot-only' not in sys.argv:render()
