"""Explain the historical PD proxy screen without recalculating its results."""
import json
from pathlib import Path
import hashlib
import html

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/power-dynamics-current'
r=json.loads((OUT/'results.json').read_text())
inputs=json.loads((OUT/'review-input.json').read_text())
spice=json.loads((OUT/'spice-check.json').read_text())
assert spice['passed'] and all(c['passed'] for c in r['numericChecks'])
for f,digest in r['inputSha256'].items():
    assert hashlib.sha256((ROOT/f).read_bytes()).hexdigest()==digest,f
s=next(s for s in r['summary'] if s['rail']=='VDD')
m=next(m for m in inputs['rails'] if m['rail']=='VDD')
def selected(profile,direction):
    return next(c for c in r['transientCases'] if c['rail']=='VDD' and c['profile']==profile
                and c['linkNH']==5 and c['mountPerCapNH']==1 and c['assumedDelayUS']==.5
                and c['stepFractionOfPDMaximum']==.5 and c['direction']==direction)
typical=selected('typical_dc','up')
reduced=selected('low_ac_sensitivity','up')
rows=[['Nominal setpoint, typical DC-biased capacitance',typical['nominalMinimumV']],
      ['Nominal setpoint, reduced capacitance sensitivity',reduced['nominalMinimumV']],
      ['Low regulator tolerance, typical DC-biased capacitance',typical['lowToleranceMinimumV']],
      ['Low regulator tolerance, reduced capacitance sensitivity',reduced['lowToleranceMinimumV']]]
out=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VDD transient margin with the updated copper</title><style>
body{{font:16px/1.6 system-ui,sans-serif;background:#f5f7fa;color:#183446;margin:0}}main{{max-width:1000px;margin:auto;padding:28px 24px 60px}}
table{{width:100%;border-collapse:collapse;background:white}}td,th{{padding:10px;border-bottom:1px solid #d4dfe7;text-align:left}}th{{background:#e6edf3}}
img{{max-width:100%}}code{{font-size:12px;overflow-wrap:anywhere}}.note{{background:#fff1dc;padding:18px;border-left:4px solid #aa6518}}a{{color:#005b96}}
</style><main><p>22 October 2026</p><h1>VDD transient margin with the updated copper</h1>
<div class="note"><strong>Historical PD proxy analysis.</strong><p>The accepted budgets are 1 A VCCL, 3 A VDD and 100 mA combined VCCH/VCCA33. These results use earlier loads and do not validate those budgets. <a href="../../README.md#bridge-current-budgets">Current planning documentation</a>.</p></div>
<p>VDD is the bridge's approximately 1.13 V core supply. Its checked voltage window is 1.10 to 1.16 V.</p>
<p>A rapid increase in chip current can briefly lower VDD. Output capacitors supply the extra current until the converter responds.</p>
<div class="note"><strong>The older 2 mV margin and 1.092 V dip came from the previous copper model.</strong>
<p>The current DC and ripple screen leaves about {s['minimumRemainingStaticAfterRippleMV']:.2f} mV at the conservative low-voltage corner.</p>
<p>The revised conditional load-step example reaches {reduced['lowToleranceMinimumV']:.5f} V at that corner.</p></div>
<h2>What the example assumes</h2><ul>
<li>Current rises from 0.90615 A to 1.8123 A in 200 ns.</li>
<li>The regulator current starts catching up after an assumed 0.5 microsecond delay. It then uses the ideal maximum buck slew.</li>
<li>Interconnect inductance is assumed to be 5 nH. Added mounting inductance is 1 nH per capacitor.</li>
<li>The reduced-capacitance sensitivity uses {reduced['effectiveCapacitanceUF']:.2f} microfarads from the nominal 75.08 microfarad bank.</li></ul>
<p>Actual PDX current steps and actual TPS62903 response delay are unknown. This analysis retains the PD maximum as a historical comparison.</p>
<table><tr><th>Case</th><th>Minimum before switching ripple</th><th>1.10 V lower limit</th></tr>
{''.join('<tr><td>'+html.escape(label)+'</td><td>'+f'{value:.5f} V'+'</td><td>'+('Above' if value>=1.1 else 'Below')+'</td></tr>' for label,value in rows)}</table>
<h2>Interpretation</h2><p>The nominal setpoint cases pass this example. The combined low-voltage and reduced-capacitance corner misses the minimum.</p>
<p>The source model prescribes current response. TI's encrypted control-loop model was not simulated.</p>
<p>This is a conditional margin finding, not an observed failure or a prediction of the actual load-step waveform.</p>
<p>Load release also needs an upper-voltage check. The reduced-capacitance high-tolerance example reaches {selected('low_ac_sensitivity','down')['highToleranceMaximumV']:.5f} V before switching ripple.</p>
<p>Thus, raising the setpoint alone can reduce the upper-voltage margin.</p>
<img src="first-response.png" alt="Conditional VCCL and VDD response for several assumed current-response delays">
<p>Later plot offsets are not voltage-recovery predictions. This model only screens the first dip and peak.</p>
<h2>Evidence</h2><p>All {len(r['numericChecks'])} numerical controls pass. The ngspice cross-check agrees on the selected minimum within {spice['minimumDifferenceMV']:.6f} mV.</p>
<p>Board SHA-256: <code>{r['sourceSha256']}</code>. The current DC report and simulation use this same artifact.</p>
<p><a href="results.json">All cases and model limitations</a> · <a href="review-input.json">Static values and DC provenance</a> · <a href="spice-check.json">Independent passive-network check</a></p>
</main></html>'''
(OUT/'vdd-note.html').write_text(out)
print(OUT/'vdd-note.html')
