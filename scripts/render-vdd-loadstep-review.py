"""Render the VDD attempt without treating incomplete simulations as passes."""
import hashlib
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/vdd-loadstep-2026-10-27'
r = json.loads((ROOT / 'manufacturing/vdd-loadstep-review-2026-10-27.json').read_text())
assert hashlib.sha256((ROOT / r['sourceFile']).read_bytes()).hexdigest() == r['sourceSha256']
assert hashlib.sha256((ROOT / 'manufacturing/stackup/selected.json').read_bytes()).hexdigest() == r['stackupSha256']
e = html.escape
b = r['alternative']['baseline']
body = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Flamingo VDD load changes</title>
<style>body{{font:17px/1.55 system-ui;max-width:920px;margin:45px auto;padding:0 22px;color:#202124}}h1{{font-size:29px}}h2{{font-size:21px;margin-top:30px}}.status{{background:#fff0dc;border-left:5px solid #a94b00;padding:17px}}code{{font-size:12px;overflow-wrap:anywhere}}a{{color:#145db5}}td,th{{padding:8px 12px;border-bottom:1px solid #ddd;text-align:left}}table{{border-collapse:collapse}}</style>
<h1>VDD during sudden load changes</h1><p>27 October 2026 · JLC06161H-3313 · current circuit unchanged</p>
<div class="status"><strong>VDD is still unverified.</strong><p>The current regulator needs a supported TI-model simulation or hardware measurements. This attempt did not establish a hardware fix.</p></div>
<h2>Current circuit</h2><p>The regulator remains TPS62903RPJR. The cheaper stackup, component positions, and copper routes remain unchanged. All assembled parts remain on top.</p>
<p>The TI PSpice and SIMPLIS models contain encryption. The available Mac simulators cannot run those models. The browser simulator also stalled.</p>
<h2>Alternative investigated</h2><p>I downloaded the official unencrypted model for the 6 A TPS62816-Q1. I tried it in ngspice and LTspice.</p>
<table><tr><th>Test</th><th>Outcome</th></tr>
<tr><td>Simplified LTspice fixture</td><td>Completed. Nominal voltage: {b['minimumNominalV']:.4f}–{b['maximumNominalV']:.4f} V for a 1.5 A load change.</td></tr>
<tr><td>Faster inductor and distributed capacitors</td><td>Stopped with numerical errors before the load changes.</td></tr>
<tr><td>Alternate integration method</td><td>Also stopped with a numerical error.</td></tr></table>
<p>The completed fixture uses a lumped 150 µF capacitor and a 0.47 µH inductor. It does not represent the Flamingo PCB.</p>
<p>Its nominal result uses most of the voltage allowance before component tolerances. It does not establish a suitable replacement circuit.</p>
<p>LTspice changed the ideal-diode parameters in the vendor model. No comparison against the original PSpice engine established the effect of that change.</p>
<p>The numerical errors do not prove that the candidate hardware fails. The incomplete runs provide no load-change result. No candidate part entered the circuit or BOM.</p>
<h2>Prepared tests for the current circuit</h2><p>The package contains twelve tests, the original TI library, and its original signature file. These tests did not run in PSpice.</p>
<p>The tests cover both directions of 1.5 A and 3 A load changes. Each edge takes 200 ns.</p>
<p>The tests include two input voltages and three static voltage corners. The required load voltage is 1.10–1.16 V.</p>
<p>The export audit passed. The exporter also rejected a mismatched board snapshot. These are file checks, not electrical test results.</p>
<p><a href="Flamingo-VDD-PSpice.zip">Download the Windows test package</a> · <a href="pspice-current/README.txt">Instructions and model limits</a> · <a href="pspice-current/handoff.json">Test manifest</a></p>
<p>The PowerShell wrapper did not run on Windows yet. A compatible simulator must complete the tests before these results can support a Rev A decision. Prototype measurements remain another way to check the circuit.</p>
<h2>Next step for a Mac-only setup</h2><p>The available UTM virtual machine runs Linux. No existing Windows VM was found.</p>
<p>A <a href="TI-support-request.txt">draft request for TI</a> asks for an unencrypted model or a vendor run of the current circuit. It also asks TI to review the damped capacitor bank and the missing test corners.</p>
<p>The draft and simulation package are ready for review. Nothing has been sent to TI. VDD remains unverified.</p>
<h2>Evidence</h2><p><a href="review.json">Full attempt record</a> · <a href="export-audit.json">Export audit</a> · <a href="lt-port.log">Completed research log</a> · <a href="candidate2.log">Detailed candidate error log</a> · <a href="candidate-gear.log">Alternate method error log</a></p>
<p>Current board SHA-256: <code>{e(r['sourceSha256'])}</code></p>
<p>Sources: <a href="https://www.ti.com/product/TPS62903">TI TPS62903 models</a> · <a href="https://www.ti.com/product/TPS62816-Q1">TI TPS62816-Q1 model</a> · <a href="https://www.ti.com/tool/PSPICE-FOR-TI">PSpice for TI</a></p></html>'''
(OUT / 'report.html').write_text(body)
print(OUT / 'report.html')
