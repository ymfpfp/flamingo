"""Render the conditional power-dynamics results as a standalone HTML report."""
import html
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"dist/power-dynamics"
r=json.loads((OUT/"results.json").read_text())
spice=json.loads((OUT/"spice-check.json").read_text())
assert spice["passed"] and all(c["passed"] for c in r["numericChecks"])
e=html.escape

def table(heads,rows):
    return "<table><thead><tr>"+"".join("<th>"+e(str(v))+"</th>" for v in heads)+"</tr></thead><tbody>"+"".join("<tr>"+"".join("<td>"+e(str(v))+"</td>" for v in row)+"</tr>" for row in rows)+"</tbody></table>"

summary=table(["Rail / proxy current","Ripple at regulator","Ripple at bridge","Low-corner static margin after ripple"],
    [[f"{s['rail']} / {s['proxyCurrentA']:.4f} A",f"{s['sourceRippleRangePPMV'][0]:.2f}–{s['sourceRippleRangePPMV'][1]:.2f} mV pp",
      f"{s['rippleRangePPMV'][0]:.3f}–{s['rippleRangePPMV'][1]:.3f} mV pp",f"{s['minimumRemainingStaticAfterRippleMV']:.2f} mV"] for s in r["summary"]])
examples=table(["Rail / step","Nominal minimum","Low-corner minimum","High-corner load-release maximum"],
    [[f"{s['rail']}: {s['halfLoadStepExample'][0]['initialCurrentA']:.4f} → {s['proxyCurrentA']:.4f} A",
      f"{s['halfLoadStepExample'][0]['nominalMinimumV']:.5f} V",f"{s['halfLoadStepExample'][0]['lowToleranceMinimumV']:.5f} V",
      f"{s['halfLoadStepExample'][1]['highToleranceMaximumV']:.5f} V"] for s in r["summary"]])
caps=table(["Rail","Capacitance case","At regulator","At bridge"],[[c["rail"],c["profile"],f"{c['sourceUF']:.2f} µF",f"{c['loadUF']:.2f} µF"] for c in r["capacitanceCases"]])
small_steps=table(["VDD load increase","Assumed response delay","Low-corner margin, including ripple"],
    [[f"{100*c['stepFractionOfPDMaximum']:.0f}% / {c['stepA']:.3f} A",f"{c['assumedDelayUS']:.1f} µs",f"{c['lowCornerMarginWithRippleMV']:.2f} mV"]
     for c in r["transientCases"] if c["rail"]=="VDD" and c["profile"]=="low_ac_sensitivity" and c["linkNH"]==5
     and c["mountPerCapNH"]==1 and c["direction"]=="up" and c["stepFractionOfPDMaximum"] in [.1,.25,.5]
     and c["assumedDelayUS"] in [.2,.5,1]])
guard=table(["Rail / rounded guardband","Direction","Low-corner minimum","High-corner maximum"],
    [[f"{c['rail']} / {max(c['initialCurrentA'],c['finalCurrentA']):.1f} A",c["direction"],f"{c['lowToleranceMinimumV']:.5f} V",f"{c['highToleranceMaximumV']:.5f} V"]
     for c in r["guardbandCases"] if c["assumedDelayUS"]==.5])
text=f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flamingo ripple and transient sensitivity</title><style>
body{{font:16px/1.6 system-ui,sans-serif;background:#f5f7fa;color:#163044;margin:0}}main{{max-width:1060px;margin:auto;padding:32px 25px 70px}}
h1{{line-height:1.2}}h2{{margin-top:36px}}table{{width:100%;border-collapse:collapse;background:white;font-size:14px;margin:18px 0}}
th,td{{padding:10px;text-align:left;border-bottom:1px solid #d8e0e7;vertical-align:top}}th{{background:#e5edf3}}img{{max-width:100%}}
.callout{{border-left:5px solid #b34535;background:#ffebe6;padding:18px 24px}}code{{font-size:12px;overflow-wrap:anywhere}}a{{color:#005b94}}li{{margin:10px 0}}
</style><main><p>Hardware review • 21 October 2026</p><h1>Ripple and transient margin at the PD current proxy</h1>
<div class="callout"><strong>Historical PD proxy analysis.</strong><p>The accepted budgets are 1 A VCCL, 3 A VDD and 100 mA combined VCCH/VCCA33. These results use earlier loads and do not validate those budgets. <a href="../../README.md#bridge-current-budgets">Current planning documentation</a>.</p></div>
<div class="callout"><strong>Switching ripple looks manageable. VDD transient margin remains insufficient in several conditional cases.</strong>
<p>The updated overall first-build judgment stays near 50%, with a broad 30–70% judgment range. Correct firmware is assumed.</p>
<p>This percentage is not a model output, confidence interval or test pass rate. Lower bridge currents help; the transient results prevent increasing confidence.</p></div>
<p><a href="../first-try-review/report.html">Complete hardware risk review</a> includes slot power, signal integrity, reset, thermals and assembly.</p>
<p>Board SHA-256: <code>{e(r['sourceSha256'])}</code>. The fresh source build has the same hash. No board copper or component placement changed.</p>
<h2>Switching ripple</h2><p>The model uses forced-PWM triangular inductor current and a harmonic solution of the passive supply network.</p>
<p>The regulator and bridge capacitor banks are separate. Samsung typical impedance curves provide ESR and inferred capacitor ESL.</p>
{summary}<p>These are sensitivity ranges, not guaranteed noise bounds. The filtering between banks makes the modeled chip ripple smaller than regulator-terminal ripple.</p>
<p>The model excludes shared-ground noise, switch-node coupling, package impedance and controller jitter. Actual total rail noise can be higher.</p>
<p>Peak inductor current stays below 2.1 A for the PD proxy currents in this sweep. Current capacity is not the main concern.</p>
<h2>Conditional load steps</h2><p>The example rises from 50% to 100% of the PD maximum in 200 ns. Current catch-up begins after an assumed 0.5 µs delay.</p>
<p>The model then applies the fastest ideal buck current slew. It uses 5 nH link inductance and 1 nH mounting inductance per capacitor.</p>
<p>The reduced-capacitance case combines typical DC-bias and small-AC factors with tolerance and temperature factors. This combination is a sensitivity assumption.</p>
{examples}<p>VDD requires 1.10–1.16 V. Its example reaches 1.0924 V at the low tolerance corner before switching ripple.</p>
<p>With typical DC-biased capacitance, the same example reaches 1.0982 V. The nominal-voltage example remains above 1.10 V.</p>
<p>The load-release example reaches 1.1557 V at the high tolerance corner. The separate half-nominal capacitance sensitivity reaches 1.1635 V.</p>
<p>Thus, raising VDD alone needs an upper-voltage check. Reducing path resistance and improving local decoupling address more than one corner.</p>
<img src="first-response.png" alt="Conditional first-response waveforms"><img src="delay-sensitivity.png" alt="Voltage-margin sensitivity to assumed response delay">
<p>The later offset in these plots is not a recovery prediction. The model contains prescribed source current, not the regulator voltage-control loop.</p>
{small_steps}<p>The actual PDX current steps and edge rates are unknown. A failed assumed step does not establish that the chip produces that step.</p>
<h2>Historical rounded current guardband</h2><p>The superseded 0.6 A VCCL / 2.3 A VDD case remains a historical comparison, not a PDX current guarantee.</p>
{guard}<p>VDD already misses its low static corner at 2.3 A in the existing resistance screen. Transient margin therefore cannot qualify this guardband.</p>
<h2>Capacitance and model coverage</h2>{caps}<p>The switching-ripple sweep includes 288 cases. The first-response sweep includes 1,440 cases, plus 32 edge/ESR cases and 16 guardband cases.</p>
<p>The number of cases has no probabilistic meaning. Neither passing cases nor passing numerical controls determine hardware success probability.</p>
<ul>{''.join('<li>'+e(s)+'</li>' for s in r['limitations'])}</ul>
<h2>Numerical controls</h2><p>All eight controls pass: DC equilibrium, charge conservation, timestep convergence and harmonic convergence for both rails.</p>
<p>An independent ngspice circuit reproduces the selected SciPy minimum within {spice['minimumDifferenceMV']:.6f} mV.</p>
<p>The maximum interior waveform difference is {spice['maximumInteriorWaveformDifferenceMV']:.6f} mV. Including slope edges, it is {spice['maximumIncludingSlopeEdgesMV']:.3f} mV.</p>
<p>The interior comparison excludes ±4 ns around slope discontinuities. Current-derivative interpolation causes the reported edge difference.</p>
<p>This checks the mathematics. It does not validate assumed parasitics, bridge loads or regulator response.</p>
<h2>Remaining board risks</h2><ul>
<li>Slot voltage drop exceeds the screened low-input budget at the rated rail stress loads.</li>
<li>USB4 and PCIe geometry checks pass, but complete channel transitions, eye masks and BER remain unqualified.</li>
<li>Slot-switch startup and shutdown SOA remain unqualified. Brownout and rapid power-cycle reset also remain open.</li>
<li>Bridge thermal behavior and the custom BGA assembly process still need qualification.</li></ul>
<h2>Evidence and reproduction</h2><p><a href="results.json">All cases and assumptions</a> · <a href="spice-check.json">Independent solver check</a> · <a href="passive-crosscheck.cir">Passive SPICE deck</a></p>
<pre><code>MPLCONFIGDIR=/tmp/flamingo-mpl python simulations/power-dynamics/run_review.py
bun simulations/power-dynamics/check_spice.mjs
python simulations/power-dynamics/render_report.py
bun scripts/review-hardware.mjs dist/board.circuit.json</code></pre>
<p>Python dependencies: NumPy, SciPy and Matplotlib. The preceding DC and static-tolerance reports must match the board hash.</p>
<ul>{''.join('<li><a href="'+e(s['url'])+'">'+e(s['title'])+'</a></li>' for s in r['references'])}</ul>
</main></html>"""
(OUT/"report.html").write_text(text)
print(OUT/"report.html")
