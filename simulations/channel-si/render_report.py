"""Render the channel screen and its explicit qualification gaps."""
import csv
import html
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review'
r=json.loads((OUT/'results.json').read_text());g=json.loads((OUT/'geometry.json').read_text())
em_path=OUT/'em3d/refined-review.json'
if not em_path.exists():em_path=OUT/'em3d/review.json'
em=json.loads(em_path.read_text()) if em_path.exists() else None
em_note=('The refined local extraction passes its declared numerical and sensitivity checks.'
         if em and em['localPCB']['qualified'] else
         'The refined local matrices pass their numerical checks. Calibration or sensitivity acceptance remains open.'
         if em and em['localPCB'].get('numericalChecksPassed') else
         'See the local experiment report for its current numerical status and physical limits.')
assert r['sourceSha256']==g['sourceSha256'] and all(c['passed'] for c in r['numericChecks'])
usbweak=next(s for s in r['summary'] if s['name']=='USB4_RX2')
pcieweak=next(s for s in r['summary'] if s['name']=='PCIE_TX3')
e=html.escape
def table(heads,rows):
    return '<table><thead><tr>'+''.join('<th>'+e(str(v))+'</th>' for v in heads)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+e(str(v))+'</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table>'
summary=table(['Channel','Copper length','Vias per leg','Nyquist','IL sensitivity at Nyquist','RL sensitivity at Nyquist'],
    [[s['name'],f"{max(s['lengthsMm']):.2f} mm",s['viaCountPerConductor'],f"{s['nyquistGHz']} GHz",
      f"{s['insertionLossSensitivityAtNyquistDB'][0]:.2f}–{s['insertionLossSensitivityAtNyquistDB'][1]:.2f} dB",
      f"{s['returnLossSensitivityAtNyquistDB'][0]:.2f}–{s['returnLossSensitivityAtNyquistDB'][1]:.2f} dB"] for s in r['summary']])
reviews=table(['Channel / leg','Signal-via position','Nearest L2–L5 ground stitch','Distance'],
    [[s['channel']+' / '+s['polarity'],f"({s['signalVia']['x']:.3f}, {s['signalVia']['y']:.3f}) mm",
      f"({s['nearestReferenceStitchVia']['x']:.3f}, {s['nearestReferenceStitchVia']['y']:.3f}) mm",f"{s['distanceMm']:.3f} mm"] for s in r['returnPathReviewPoints']])
clock=r['referenceClock']['audit']
clock_table=table(['Reference clock','Copper length'],[[s['name'],f"{s['copperLengthMm']:.3f} mm"] for s in clock['refclk']])
checks=table(['Numerical control','Result'],[[s['name'],'PASS' if s['passed'] else 'FAIL'] for s in r['numericChecks']])
links=''.join('<li><a href="reduced-touchstone/'+e(s['name'])+'-surrogate.s2p">'+e(s['name'])+' synthetic PCB surrogate</a></li>' for s in r['summary'])
references=[]
for s in r['references']:
    path=s.get('url','../../'+s.get('file',''))
    references.append('<li><a href="'+e(path)+'">'+e(s['title'])+'</a>'+(' — '+e(s.get('sections',s.get('pages',''))) if 'file' in s else '')+'</li>')
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flamingo USB4 and PCIe channel review</title><style>
body{{font:16px/1.6 system-ui,sans-serif;color:#173044;background:#f4f7fa;margin:0}}main{{max-width:1100px;margin:auto;padding:32px 25px 70px}}
h1{{font-size:34px;line-height:1.2}}h2{{margin-top:36px}}table{{width:100%;border-collapse:collapse;background:white;font-size:14px;margin:18px 0}}
th,td{{padding:10px;border-bottom:1px solid #dbe2e8;text-align:left;vertical-align:top}}th{{background:#e4edf3}}img{{max-width:100%}}code{{font-size:12px;overflow-wrap:anywhere}}
.callout{{padding:18px 24px;background:#fff0d9;border-left:5px solid #b76810}}.open{{background:#ffebe6;border-color:#b34535}}a{{color:#065c98}}li{{margin:8px 0}}
</style><main><p>Hardware review • 21 October 2026 • 12 data pairs plus reference-clock geometry</p><h1>USB4 / PCIe channel review</h1>
<div class="callout open"><strong>Component-aware screening is complete. Full channel SI verification remains open.</strong>
<p>The new model includes emitted routes, finite neck lengths, capacitor behavior, ESD loading, pad capacitance and via surrogates.</p>
<p>The reduced channel network excludes connector internals and the bridge package/die. No eye, BER or compliance pass is claimed.</p>
<p><a href="em3d/report.html">3D electromagnetic extraction and numerical checks</a> records the separate local PCB experiment.</p></div>
<p>{em_note}</p>
<p>Board SHA-256: <code>{e(r['sourceSha256'])}</code>. A fresh source build produced this snapshot.</p>
<p>The per-type circuit elements match the previous review: <strong>{g['sameElementsAsPriorReview']}</strong>. Serialization order changes the file hash.</p>
<p>No signal copper, vias or component placement changed in this review.</p>
<h2>How the assessment works</h2><ol>
<li>Extract every routed section from bridge pads to connector pads. Preserve widths, layers, vias, lands and reference-plane openings.</li>
<li>Use manufacturer models where available. State their reference impedance, mounting conditions and valid bandwidth.</li>
<li>Cascade the passive networks and inspect insertion loss and reflection. Sweep uncertain material and transition parameters.</li>
<li>Extract critical launches in a validated 3D solver. Add exact connector, package and die models at defined reference planes.</li>
<li>Apply the transmitter, receiver and standard compliance channels. Assess equalization, crosstalk, eye margins and BER.</li></ol>
<p>This review completes the first three steps as a reduced sensitivity screen. Local 3D extraction starts step four. Complete channel and eye qualification remain open.</p>
<h2>Results and priorities</h2><ul>
<li><strong>USB4 RX2</strong> has the highest upper sensitivity result at 10 GHz: about {usbweak['insertionLossSensitivityAtNyquistDB'][0]:.2f}–{usbweak['insertionLossSensitivityAtNyquistDB'][1]:.2f} dB.</li>
<li><strong>PCIe TX3</strong> is the longest TX path. Its sensitivity result is about {pcieweak['insertionLossSensitivityAtNyquistDB'][0]:.2f}–{pcieweak['insertionLossSensitivityAtNyquistDB'][1]:.2f} dB at 8 GHz.</li>
<li><strong>USB4 RX1 return stitching</strong> is a concrete layout review point. One layer-change via is about 1.81 mm from the nearest ground stitch.</li>
<li>All current USB4, PCIe TX/RX and clock routing audits pass. These audits do not solve the launches or certify the assembled channel.</li></ul>
<p>The ranges above are sensitivity results. They are not verified physical bounds, probabilities or measured channel losses.</p>
<p>The model excludes connector and package internals. Their losses and reflections cannot be replaced with an arbitrary fixed allowance.</p>
{summary}<p>IL is insertion loss; lower is better. RL is positive return loss; higher is better. All values use the model's PCB endpoint ports.</p>
<img src="channel-loss-sensitivity.png" alt="USB4 and PCIe insertion-loss sensitivity"><img src="channel-return-loss.png" alt="Reduced-model return loss">
<h2>Return paths</h2><p>The return-via search resolves electrical connectivity through named nets and routed traces. It includes ground vias without a direct net-ID field.</p>
<p>Each counted stitch connects both L2 and L5. There are {len(g['groundVias'])} such vias in the frozen board snapshot.</p>
<p>The 1 mm threshold below is a review trigger. It is not a USB4 compliance limit or proof of a defective return path.</p>
{reviews}<img src="usb4-return-paths.png" alt="USB4 copper, reference-plane return vias and review locations">
<p>Nearest-via distance does not determine loop impedance alone. Plane apertures, nearby conductors and P/N asymmetry require 3D field extraction.</p>
<h2>Component model coverage</h2>
{table(['Part / element','Evidence used','Unresolved'],[
 ['Murata USB4 TX, 220 nF','Exact 50-ohm series-mode S-parameters, 100 Hz–6 GHz, 25 °C, 0 V','Above 6 GHz uses an RL fit. USB4 needs assessment at 10 GHz and beyond.'],
 ['Murata USB4 RX, 330 nF','Same-package TX model with nominal capacitance changed','No usable exact RX model retrieved. This remains a proxy.'],
 ['Samsung PCIe TX, 220 nF','Exact manufacturer precise series-mode complex S-parameters through 6 GHz, 25 °C, 0 V','Above 6 GHz uses an RL fit. The mounting fixture and full Gen4 band remain unqualified.'],
 ['Infineon ESD150-B1-W0201','Typical 10 GHz capacitance; assumed mounting-loop inductance and loss','No exact S-parameter file retrieved.'],
 ['G-Switch GT-USB-7087B','Manufacturer drawing explicitly rates transmission up to 40 Gbps','No mated multiport model retrieved. Rating alone does not qualify our launch.'],
 ['XKB X1618WVS-164-9TV30','Manufacturer PCIe 4.0 family drawing','No mated multiport model retrieved.'],
 ['Bridge package and die','PCB endpoint geometry only','Package S-parameters and TX/RX IBIS-AMI models are missing.'],
 ['Vias and lands','Full-channel screen uses analytic and lumped sensitivity models','A separate native 3D experiment covers the USB4 RX2 local via pair. Other transitions and coupled-channel extraction remain open.']])}
<p>The Murata RL fit uses 1–6 GHz data: R ≈ {r['murataModel']['seriesRFitOhm']:.3f} Ω and L ≈ {r['murataModel']['seriesLFitNH']:.3f} nH.</p>
<p>The maximum complex-impedance fitting error within that band is about {r['murataModel']['maximumComplexZFitErrorOhm']:.3f} Ω. Fit agreement does not validate extrapolation.</p>
<h2>Applicable limits and reference planes</h2><p>ASMedia's routing guide gives a short-route alternative or less than 4 dB insertion loss at 10 GHz for USB4.</p>
<p>USB4 section 3.1.1.1 separately recommends at most 7.5 dB for a Gen 3 router assembly, including receptacle, PCB, package and die load.</p>
<p>Those budgets have different scopes. Neither establishes a complete channel pass from this reduced PCB-only result.</p>
<p>USB4 return-loss masks apply at TP2 or TP3' with the assembly loading included. Applying those masks directly to these PCB ports would be invalid.</p>
<p>PCIe Gen4 assessment also needs the connector, package, appropriate channel allocation and receiver equalization. No arbitrary board-only pass threshold is invented here.</p>
<h2>Reference clock</h2>{clock_table}<p>Drawn P/N copper skew is {clock['refclkSkewMm']:.6f} mm. The current routing audit passes.</p>
<p>Loaded clock edges, common-mode behavior and jitter remain unqualified. Crystal startup remains a separate hardware check.</p>
<h2>Numerical controls</h2>{checks}<p>The checks cover exact line/resistor solutions, vendor-model topology, reciprocity and passivity.</p>
<p>They check the implementation. They do not validate the assumed physical transitions. Causality is not qualified for time-domain use.</p>
<h2>Full limitations</h2><ul>{''.join('<li>'+e(s)+'</li>' for s in r['limitations'])}</ul>
<h2>What closes the remaining work</h2><p>Obtain the exact package/component models and factory stackup data. Then extract the marked transitions and cascade the complete channel.</p>
<p>Use standard compliance channels for board qualification. A particular GPU or cable model is useful only for a specific complete-link assessment.</p>
<p><a href="../../simulations/channel-si/model-requests.txt">Exact model/data request checklist</a>. No supplier messages have been sent.</p>
<h2>Evidence and reproduction</h2><p><a href="results.json">All cases and assumptions</a> · <a href="geometry.json">Extracted geometry and audits</a> · <a href="field-solver-handoff.json">Full copper/stackup handoff</a> · <a href="channel-summary.csv">Summary CSV</a></p>
<p>The following files are synthetic frequency-domain sensitivity models. They are not extracted or measured channel files.</p><ul>{links}</ul>
<pre><code>bun scripts/build-board.mjs dist/si-channel-review/board.circuit.json
bun simulations/channel-si/download-model.mjs
python simulations/channel-si/download-samsung.py
bun scripts/prepare-channel-review.mjs
MPLCONFIGDIR=/tmp/flamingo-si-mpl python simulations/channel-si/run_review.py
python simulations/channel-si/render_report.py</code></pre>
<p>The numerical code also reads the earlier checked 2D cross-section reports. Input hashes must match the saved results.</p>
<h2>Sources</h2><ul>{''.join(references)}</ul>
</main></html>'''
(OUT/'report.html').write_text(page)
with (OUT/'channel-summary.csv').open('w',newline='') as f:
    writer=csv.writer(f);writer.writerow(['channel','maximum_copper_mm','vias_per_leg','nyquist_GHz','IL_sensitivity_min_dB','IL_sensitivity_max_dB','full_channel_verified'])
    for s in r['summary']:writer.writerow([s['name'],max(s['lengthsMm']),s['viaCountPerConductor'],s['nyquistGHz'],*s['insertionLossSensitivityAtNyquistDB'],False])
print(OUT/'report.html')
