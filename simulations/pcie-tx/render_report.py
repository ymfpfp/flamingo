"""Render the saved nominal screen and manual review procedure as local HTML."""
from pathlib import Path
import json
from html import escape

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/pcie-si'
r=json.loads((OUT/'report.json').read_text())
g=json.loads((OUT/'geometry.json').read_text())
nom=r['nominal_cross_section']
checks=r['numerical_checks']
audit=r['routing_audit']
spacing=r.get('asmedia_spacing')
isolation_row=''
if spacing:
    assert spacing['passed']
    minimum=min(c['minimumGapMm'] for c in spacing['results'])
    isolation_row=f'<tr><td>ASMedia coupled-route isolation, TX and RX</td><td>Minimum {minimum:.3f} mm; required &gt;{spacing["requiredGapMm"]:.4f} mm (8h).</td><td>Foreign pads, ground vias and traces checked. BGA pad escapes and local via/capacitor/slot launches remain separate SI review regions.</td></tr>'
assert audit['passed']
assert all(c['badLengthMm']==0 for c in audit['coupling'])
rows=[]
for lane in range(4):
    lengths={p:sum(c['length_mm'] for c in g['conductors'] if c['name']==f'TX{lane}_{p}') for p in 'PN'}
    row=r['geometry_summary'][lane]
    samples=[c for c in audit['coupling'] if c['name'].startswith(f'TX{lane}_')]
    gap_min=min(c['minGapMm'] for c in samples);gap_max=max(c['maxGapMm'] for c in samples)
    rows.append(f"<tr><td>TX{lane}</td><td>{lengths['P']:.3f}</td><td>{lengths['N']:.3f}</td>"
        f"<td>&lt;0.001</td><td>{gap_min:.4f}–{gap_max:.4f}</td><td>0</td></tr>")
sens=''.join(f"<tr><td>{escape(s['name'].replace('_',' '))}</td><td>{s['impedance_ohm']:.1f}</td></tr>" for s in r['sensitivity'])
outside=max(c['centerline_over_void_outside_own_via_openings_mm'] for c in g['conductors'])
assert outside<1e-6, 'New plane opening outside signal-via apertures requires a report update'
assert len(g['vias'])==16
assert all(abs(c['length_mm']-sum(run['length_mm'] for run in c['runs']))<1e-6 for c in g['conductors'])
html=f'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PCIe TX impedance and signal integrity review</title>
<style>
body{{max-width:1060px;margin:40px auto;padding:0 24px;font:16px/1.6 system-ui,sans-serif;color:#172827;background:#fcfdfc}}
h1{{font-size:30px;line-height:1.2}}p,li{{max-width:90ch}}li{{margin:14px 0}}strong{{color:#103e36}}
.status{{padding:18px 22px;border-left:5px solid #b34728;background:#fff1e9}}
table{{border-collapse:collapse;width:100%;font-size:14px;margin:20px 0}}td,th{{padding:10px;text-align:left;border-bottom:1px solid #d3ded8}}
th{{background:#edf4f0}}img{{width:100%;height:auto}}figure{{margin:28px 0}}figcaption,.small{{font-size:13px;color:#49615a}}
code{{font-size:13px;overflow-wrap:anywhere}}pre{{padding:16px;background:#edf4f0;overflow:auto}}
a{{color:#13635c}}details{{margin:20px 0}}summary{{cursor:pointer;font-weight:650}}.table{{overflow:auto}}
@media print{{body{{margin:12mm;max-width:none}}details{{display:block}}figure,table{{break-inside:avoid}}}}
</style>
<h1>PCIe TX impedance and signal integrity review</h1>
<p class="status"><strong>The individual tuning loops are removed. Coupled trunk geometry and drawn skew pass.</strong>
The straight-section screen supports the nominal 85 Ω design. Launch and via SI remain open.
This review does not establish Gen4 eye or BER compliance.</p>
<p>The review uses a frozen copy of the rendered board. It does not change the routes.
The independent 2D solver uses the selected fabrication stackup and published calculator parameters.</p>
<p><strong>What the available data supports</strong></p>
<div class="table"><table><tr><th>Item</th><th>Result</th><th>Meaning</th></tr>
<tr><td>Uniform surface pair</td><td>{nom['impedance_ohm']:.1f} Ω differential</td><td>Nominal quasi-static result within 76.5–93.5 Ω.</td></tr>
<tr><td>Numerical checks</td><td>{checks['last_mesh_step_change_ohm']:.3f} Ω mesh change</td><td>Domain change {checks['expanded_domain_change_ohm_at_1um']:.3f} Ω.
Thin-line benchmark error {checks['thin_line_analytic_error_percent']:.2f}%.</td></tr>
<tr><td>Coupled trunks</td><td>0.1234 mm width / 0.1001 mm straight gap</td><td>No individual tuning loops. All sampled trunk points pass the straight/bend gap envelope.</td></tr>
{isolation_row}
<tr><td>Signal vias</td><td>Two per conductor. Bridge: 0.25 / 0.15 mm. Capacitor: 0.30 / 0.20 mm.</td><td>Dimensions are pad / hole.
Top-to-bottom paths use the full barrel. No unused barrel stub appears in the saved routes.</td></tr>
<tr><td>Via return path</td><td>Nearest GND via ≤{r['ground_return_max_distance_mm']:.2f} mm</td><td>The reference-plane openings are about 0.65–0.70 mm across.
Some openings merge. Return inductance remains unsolved.</td></tr>
<tr><td>Reference planes</td><td>L2 for top. L5 for bottom.</td><td>The route centerlines avoid unrelated plane openings.
This check excludes their own via apertures. It does not assess the full field footprint.</td></tr>
<tr><td>Pad launches</td><td>Cap lands 0.50 × 0.54 mm. Slot pads about 2.00 × 0.70 mm.</td><td>These dimensions differ substantially from the 0.1234 mm traces. Actual discontinuity impedance requires 3D analysis.</td></tr>
<tr><td>Loss, crosstalk and mode conversion</td><td>Not solved</td><td>Actual material loss, roughness, final copper and component models remain incomplete.</td></tr>
</table></div>
<p>The nominal pair uses a 0.1234 mm base width and a 0.1001 mm edge gap.
Its reference-plane distance and dielectric Dk come from the selected fabrication recipe.
The model includes 40.64 μm finished copper, a 17.78 μm width reduction at the trace top, and the published mask model.
The nominal 35 μm foil label is a different input.
<a href="https://jlcpcb.com/help/article/user-guide-to-the-jlcpcb-impedance-calculator">JLCPCB explains these calculator parameters.</a></p>
<p>The solver uses finite-volume electrostatics with odd symmetry. Actual-dielectric and vacuum capacitances give Zdiff = 1/(c√(C·Cair)).
It excludes loss, dispersion, bends, vias and adjacent traces.
Mesh convergence does not establish accuracy for an unknown manufactured cross-section.
The thin-line benchmark uses the <a href="https://qucs.sourceforge.net/tech/node75.html">Hammerstad–Jensen equations in the Qucs reference</a>.</p>
<figure><img src="geometry-review.png" alt="TX bottom routes with nominal spacing in teal and spacing departures in red">
<figcaption>Board coordinates from the frozen Circuit JSON. Red identifies local launches, not a measured impedance failure.
The sampling pitch is 0.01 mm. The audit permits the 45° miter envelope at bends.</figcaption></figure>
<div class="table"><table><tr><th>Lane</th><th>P length (mm)</th><th>N length (mm)</th><th>Drawn mismatch (mm)</th><th>Sampled trunk gap (mm)</th><th>Trunk gap violations</th></tr>
{''.join(rows)}</table></div>
<p>Lengths include both board sections on either side of each coupling capacitor.
They exclude via depth, pad span across the capacitor, package delay and connector internals.
Equal drawn lengths do not establish equal delay. Coupling and local dielectric environments also affect delay.</p>
<p>The long corridors now retain nominal pair spacing. Local two-layer escapes balance the drawn lengths.
No individual tuning loops remain. The bridge vias now use the existing filled/capped BGA process.
The signal land vias include R20, U21, AA17 and AA15. The offset V9 ground land via provides the TX3 launch return.
These features remain subject to the existing combined land, mask and stencil DFM review.</p>
<p>The trunk audit excludes the first 3 mm after the BGA via and final 0.4 mm before the capacitor via.
Those intervals contain the required fanouts. All other sampled bottom copper passes the gap envelope.
The nominal gap is 0.1001 mm. The geometric miter envelope reaches about 0.1185 mm at a corner.
The uniform-gap sensitivity proxy at that envelope gives {r['miter_corner_gap_proxy']['impedance_ohm']:.1f} Ω.
That proxy is not a 3D extraction of the bend.</p>
<figure><img src="impedance-screen.png" alt="Uniform pair impedance versus gap and an illustrative mismatch response">
<figcaption>The right plot illustrates the removed wide-gap routing with an ideal 5 mm uniform line.
It is not an extraction of these routes.
No channel return-loss pass or failure follows from that example.</figcaption></figure>
<p><strong>How to review the design manually</strong></p>
<ol>
<li><strong>Establish the fabrication inputs.</strong>
Get the factory-approved cross-section for the selected fabrication recipe.
Record the finished trace dimensions, dielectric thicknesses, Dk, mask and process tolerances.
Resolve the 35 μm nominal foil versus 40.64 μm calculator copper distinction.
Request an 85 Ω differential coupon report. The ASMedia guideline specifies ±10%, or 76.5–93.5 Ω.
The coupon covers uniform traces. It does not qualify the launches.</li>
<li><strong>Repeat the straight-section calculation.</strong>
Select a coated, non-coplanar differential microstrip model with the correct reference plane.
Enter the actual dimensions and material values.
Use an independent 2D solver to compare the result.
Run the documented fabrication corners. The target is 85 Ω for the pair.
It is not 85 Ω per conductor. Differential impedance equals twice the odd-mode impedance.
An isolated trace calculation does not include pair coupling.
<a href="https://www.keysight.com/us/en/assets/7018-01461/application-notes/5989-5763.pdf">Keysight explains this distinction.</a></li>
<li><strong>Inspect every physical transition.</strong>
Display bottom copper together with L5. Display top copper together with L2.
Trace each lane from its BGA balls to the capacitor and slot pads.
Inspect the red launch regions near X24–32 mm and each capacitor approach near X1.65 mm.
Record the gap, nearby copper, pad width, bends, via pitch and plane apertures.
Compare both conductors through each transition.
Use symmetric escapes and coupled bends wherever the pin geometry permits them.
Retain the coupled trunk geometry during future edits.
For each via, include its return vias and the actual merged antipads.
Equal via counts alone do not establish a matched transition.</li>
<li><strong>Analyze the transitions as 3D structures.</strong>
Import the actual copper, dielectrics, barrels and plane apertures into a 3D EM solver.
Include the BGA escape, coupled bends, both via transitions, capacitor lands and connector launch.
Include nearby pairs for crosstalk analysis.
Extract a complete four-port model for each differential path.
Use suitable port modes and consistent reference planes.
Refine the mesh and port locations until the results stabilize.
For openEMS, extract the matrix with one active port per run.
<a href="https://docs.openems.de/en/latest/concepts/ports.html">The openEMS port documentation explains the excitation rules and limitations.</a>
Convert the result to mixed-mode S parameters.
Record the differential reference impedance explicitly. Two 50 Ω single-ended references ordinarily give 100 Ω differential.
Renormalize correctly for an 85 Ω comparison.</li>
<li><strong>Assess the assembled channel.</strong>
Add wideband models for the package, 220 nF capacitors and connector.
An ideal capacitor does not represent its GHz parasitics.
Review Sdd11/Sdd22 (reflections), Sdd21 (transmission), and Scd21 (differential-to-common conversion).
Also review delay imbalance and adjacent-lane coupling.
Cover 8 GHz, the Nyquist frequency for 16 GT/s NRZ.
Extend the sweep for the actual edge rate.
Compare results against the applicable PCIe channel definition and allocated budget.
The selected channel reference planes determine that budget.
Package and transmitter/receiver models then support eye and BER analysis.
The current review has no such models.</li>
<li><strong>Measure a prototype or representative coupon.</strong>
Use differential TDR or a calibrated four-port VNA.
Isolate the passive path from active devices for the fixture measurement.
Calibrate and deskew the two polarities at the DUT connection.
De-embed the fixture to the chosen reference planes.
Use the instrument-approved termination arrangement.
Record the differential reference impedance and rise time.
Account for the coupling capacitors in the response.
Do not interpret their charging response as the local trace impedance.
For reflection coefficient ρ, Z = Zref·(1+ρ)/(1−ρ).
At this stackup, propagation speed is roughly 174 mm/ns.
A 35 ps system rise time separates discontinuities only about 3 mm apart.
It cannot resolve each short land as an independent plateau.
<a href="https://www.tek.com/en/documents/primer/tdr-test">Tektronix explains TDR resolution and deskew.</a>
<a href="https://helpfiles.keysight.com/scopes/FlexDCA-UG/Content/Topics/TDR-TDT-Mode/Fixture-Deembedding/deembed-intro.htm">Keysight explains fixture removal.</a>
Compare measured S parameters with the model.
Complete the applicable Gen4 electrical and stressed-receiver tests for a compliance claim.
A successful link or throughput run alone does not establish compliance.</li>
</ol>
<p><strong>Available evidence and remaining limits</strong></p>
<p>The local <a href="../../datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf">ASMedia PCB guideline</a>
specifies ground-referenced microstrip and an 85 Ω ±10% pair.
The connector path must be less than 5 inches long. Its P/N mismatch must be less than 5 mil.
The connector path permits at most two vias per conductor.
The saved geometry meets the length and via-count screens. Those screens do not establish signal integrity.</p>
<details><summary>Assumed sensitivity cases</summary>
<p>Each row changes one input. These are assumed perturbations, not factory process limits or production yield predictions.</p>
<table><tr><th>Change</th><th>Differential impedance (Ω)</th></tr>{sens}</table></details>
<details><summary>Reproduce this review</summary>
<pre>python3 -m venv /private/tmp/flamingo-pcie-si-venv
/private/tmp/flamingo-pcie-si-venv/bin/python -m pip install -r simulations/pcie-tx/requirements.txt
MPLCONFIGDIR=/private/tmp/flamingo-pcie-mpl /private/tmp/flamingo-pcie-si-venv/bin/python simulations/pcie-tx/run_review.py
/private/tmp/flamingo-pcie-si-venv/bin/python simulations/pcie-tx/render_report.py</pre>
<p>The default input is dist/preview/circuit.json. Pass a different rendered Circuit JSON as the first argument to run_review.py.
This input must contain the completed PCIe TX routes. A stale or unrouted snapshot cannot support this review.</p>
<p><a href="report.json">Numerical results</a> · <a href="geometry.json">Sampled geometry</a> ·
<a href="routing-audit.json">Skew and trunk-gap audit</a> ·
<a href="input.circuit.json">Frozen board</a> · <a href="field-solver-handoff.json">Geometry handoff for a future solver project</a> ·
<a href="cross-section-field.png">Cross-section potential plot</a></p>
<p>The handoff contains design geometry and unresolved inputs. It is not a completed 3D simulation project.</p></details>
<p class="small">Board SHA-256: <code>{escape(r['source_sha256'])}</code><br>
Stackup SHA-256: <code>{escape(r['stackup_sha256'])}</code></p>
</html>'''
(OUT/'report.html').write_text(html)
print(OUT/'report.html')
