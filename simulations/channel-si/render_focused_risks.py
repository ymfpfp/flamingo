"""Render concrete layout decisions from the bounded focused SI checks."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import html
import json
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as Patch
from shapely.geometry import LineString, box

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'dist/si-channel-review/focused-risks'
INPUT = ROOT / 'dist/si-channel-review/selected-stackup-inputs'
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from copper_geometry import copper_objects


def read(p):
    return json.loads(p.read_text())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def table(heads, rows):
    e = lambda s: html.escape(str(s))
    return '<div class="scroll"><table><tr>' + ''.join('<th>' + e(v) + '</th>' for v in heads) + '</tr>' + ''.join('<tr>' + ''.join('<td>' + e(v) + '</td>' for v in r) + '</tr>' for r in rows) + '</table></div>'


def plot_neck(necks):
    current = read(OUT / 'current-board.circuit.json')
    geometry = read(OUT / 'current-inputs/geometry.json')
    c = next(v for v in geometry['channels'] if v['name'] == 'PCIE_RX3')
    n = next(v for v in necks['channels'] if v['name'] == 'PCIE_RX3')
    region = box(28.05, 101.32, 29.06, 102.95)
    all_copper = copper_objects(current)
    fig, ax = plt.subplots(figsize=(7.3, 7.3), layout='constrained')
    for v in sorted(all_copper, key=lambda v: not v['label'].startswith('pcb_copper_pour')):
        if 'top' not in v['layers'] or not v['shape'].intersects(region):
            continue
        clipped = v['shape'].intersection(region)
        pieces = [clipped] if clipped.geom_type == 'Polygon' else getattr(clipped, 'geoms', [])
        for p in pieces:
            if p.geom_type == 'Polygon':
                ax.add_patch(Patch(list(p.exterior.coords), facecolor='#c5cbd1', edgecolor='white', linewidth=.3))
                for hole in p.interiors:
                    ax.add_patch(Patch(list(hole.coords), facecolor='white', edgecolor='none'))
    colors = {'P': '#087e8b', 'N': '#cf6900'}
    for leg in c['conductors']:
        for stage in leg['stages']:
            for s in stage['segments']:
                if s['layer'] != 'top':
                    continue
                p = LineString([(s['from']['x'], s['from']['y']), (s['to']['x'], s['to']['y'])]).buffer(s['widthMm'] / 2)
                if p.intersects(region):
                    ax.add_patch(Patch(list(p.exterior.coords), facecolor=colors[leg['polarity']], edgecolor='none'))
        ax.plot([], [], color=colors[leg['polarity']], linewidth=5, label='Existing ' + leg['polarity'])
    start = next(v['startFullWidthAt'] for v in n['recommendation']['changePoints'] if v['polarity'] == 'N')
    points = [(start['x'], start['y']), (28.35, 102.6), (28.3565, 102.6065)]
    proposed = LineString(points).buffer(.1234 / 2)
    ax.add_patch(Patch(list(proposed.exterior.coords), facecolor='#3264c8', edgecolor='#123c8f', alpha=.6, linewidth=1, label='Proposed wider N section'))
    ax.annotate('Widen final 0.3703 mm\nto 0.1234 mm', xy=(28.35, 102.45), xytext=(28.07, 102.80), fontsize=10, arrowprops={'arrowstyle': '->', 'color': '#123c8f'})
    ax.set(xlim=(28.02, 29.07), ylim=(101.28, 102.97), xlabel='Board X (mm)', ylabel='Board Y (mm)', title='PCIe RX3: recommended local neck cleanup\nCandidate only — board copper has not changed')
    ax.set_aspect('equal')
    ax.grid(alpha=.15)
    ax.legend(loc='lower left', fontsize=9)
    fig.savefig(OUT / 'rx3-neck-proposal.png', dpi=170)
    plt.close(fig)


def main():
    necks, loss, returns, xtalk, comparison = [read(OUT / f) for f in ['necks.json', 'loss-loading.json', 'return-paths.json', 'crosstalk.json', 'current-input-comparison.json']]
    frozen = sha(INPUT / 'board.circuit.json')
    current = sha(OUT / 'current-board.circuit.json')
    stack = sha(INPUT / 'selected.json')
    assert sha(ROOT / 'manufacturing/stackup/selected.json') == stack
    assert all(v['sourceSha256'] == frozen and v['stackupSha256'] == stack for v in [necks, loss, xtalk])
    assert returns['sourceSha256'] == current and returns['stackupSha256'] == stack
    assert comparison['currentSourceSha256'] == current and comparison['signalRoutesAllUnchangedTo1eMinus10Mm']
    assert comparison['allFourCurrentRoutingAuditsPassed'] and comparison['groundViaGeometryAndOrderUnchanged']
    assert all(v['symmetricDifferenceAreaMm2'] < 1e-10 for v in comparison['groundPlaneComparison'])
    assert all(c['passed'] for x in [necks, loss] for c in x['numericChecks'])
    assert all(c['passed'] for c in xtalk['controls'])
    assert not returns['electricalComplianceFailureConfirmed']
    proposal = next(v for v in necks['channels'] if v['name'] == 'PCIE_RX3')['recommendation']
    assert proposal['clearance']['passed'] and not proposal['demonstratedComplianceFailure']
    decisions = [
        {'area': 'PCIe RX3 unequal neck lengths', 'classification': 'Recommended small layout cleanup', 'change': 'Widen only the final 0.370300 mm of RX3_N to0.1234mm. Retain the earlier narrow escape, P route, both centerlines and total copper lengths.', 'reason': 'This makes both narrow lengths0.794155mm and follows TI symmetric/equal-neck guidance. Fresh local copper clearance passes. The modeled loss improvement is only0.009–0.013dB; no compliance failure was demonstrated.', 'mandatoryFailureProven': False},
        {'area': 'USB4 TX2 / RX1 narrow escapes', 'classification': 'No layout change established', 'change': 'Retain the matched narrow escapes. Do not blindly widen the BGA sections.', 'reason': 'Both legs have0.955269mm necks. Finite neck-only mismatch loss is0.037–0.100dB at10GHz in the selected line-model scenarios. Blind full widening would reduce adjacent-pad clearance below0.10mm.', 'mandatoryFailureProven': False},
        {'area': 'USB4 return paths / ESD grounds', 'classification': 'No mandatory stitch change established', 'change': 'Keep the existing connected ground guards. Closer RX1 return stitches are an optional improvement.', 'reason': 'Guard pitch reaches1.000mm versus1.016mm guidance, no floating guard was found in the checked bands, and all8 ESD ground pads connect to both GND reference planes. The old1mm nearest-stitch trigger was a heuristic.', 'mandatoryFailureProven': False},
        {'area': 'USB4 RX2 / PCIe TX3 loss', 'classification': 'No loss-driven reroute established', 'change': 'Do not reroute from the surrogate loss numbers alone. Confirm production material and mounted launch behavior.', 'reason': 'USB4 RX2 meets the guide short-route alternative; the0.19dB scenario difference is not a required margin. PCIe TX3 meets connector-route length guidance and no PCB-only8GHz dB limit was supplied. Loss remains material/model dependent.', 'mandatoryFailureProven': False},
        {'area': 'Ordinary isolated straight trunks', 'classification': 'No wider-spacing change established by stress model', 'change': 'Retain the checked trunk spacing.', 'reason': 'An independent4-conductor quasi-TEM stress model at8h spacing finds low differential coupling and passes numerical controls. It excludes launches, asymmetry and vias, so it is not complete-channel crosstalk clearance.', 'mandatoryFailureProven': False},
        {'area': 'Loaded finite launches and complete link', 'classification': 'Unresolved', 'change': 'No specific additional layout change can be determined from the available models.', 'reason': 'BGA/via/pad/connector/package fields, complete mixed-mode crosstalk, eye and BER have not been fully extracted or qualified. The focused results cannot guarantee full-speed first-build success.', 'mandatoryFailureProven': False},
    ]
    inputs = [OUT / f for f in ['necks.json', 'loss-loading.json', 'return-paths.json', 'crosstalk.json', 'current-input-comparison.json', 'current-board.circuit.json']] + [Path(__file__)]
    result = {'createdUTC': datetime.now(timezone.utc).isoformat(), 'scope': 'Focused fast SI checks for actionable layout decisions; not complete-channel qualification.', 'frozenSourceSha256': frozen, 'currentSourceSha256': current, 'stackupSha256': stack, 'mandatoryLayoutChangesFromDemonstratedSIFailures': [], 'recommendedLayoutChanges': [decisions[0]], 'decisions': decisions, 'physicalBoardModified': False, 'native3DSolvesLaunched': 0, 'fullChannelVerified': False, 'firstTrySuccessProbability': None, 'inputSha256': {str(p.relative_to(ROOT)): sha(p) for p in inputs}}
    (OUT / 'results.json').write_text(json.dumps(result, indent=2) + '\n')
    plot_neck(necks)
    e = html.escape
    rows = [[d['area'], d['classification'], d['change'], d['reason']] for d in decisions]
    controls = table(['Model / numerical control', 'Result'], [[source + ': ' + c['name'], 'PASS' if c['passed'] else 'FAIL'] for source, entries in [('Necks', necks['numericChecks']), ('Loss/loading', loss['numericChecks']), ('Crosstalk', xtalk['controls'])] for c in entries])
    paragraphs = ''.join('<li>' + e(v) + '</li>' for v in ['No full-speed failure has been demonstrated by these focused calculations. This does not prove that every channel will work.', 'The only recommended geometry edit is a small RX3 neck-width transition. It is a guideline cleanup with a small modeled benefit, not a proven cure for a failing lane.', 'The optional closer ground vias need new power-plane antipads, repour and full native DRC if implemented. Their magnetic-energy estimates omit plane spreading, capacitance, radiation and high-frequency current distribution.', 'The normal trunk crosstalk screen uses two symmetric parallel pairs and uninterrupted GND. Its stress geometry is not a mathematical bound on arbitrary launches.', 'Exact high-frequency laminate loss/roughness and mounted connector/package/component models remain unavailable. Do not remove ESD, shrink mandatory connector lands or cut GND planes from a lumped capacitance result alone.'])
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flamingo — focused SI layout decisions</title><style>body{margin:0;background:#f5f7fa;color:#173044;font:16px/1.55 system-ui,sans-serif}main{max-width:1150px;margin:auto;padding:30px 24px 70px}h1{line-height:1.2}h2{margin-top:32px}.callout{padding:18px 22px;background:#fff0d9;border-left:5px solid #b27117}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;background:white;font-size:14px;margin:20px 0}th,td{text-align:left;vertical-align:top;padding:11px;border-bottom:1px solid #dce4ec}th{background:#e5edf3}img{max-width:100%}code{font-size:12px;overflow-wrap:anywhere}li{margin:9px 0}a{color:#075b92}</style><main><p>Focused USB4 / PCIe review · ''' + e(result['createdUTC']) + '''</p><h1>Which SI risks call for a layout change?</h1><div class="callout"><strong>No mandatory reroute was established by the focused checks.</strong><p>One small RX3 neck cleanup is recommended. The other flags do not currently establish a required layout change. Loaded launches and complete-link performance remain unresolved.</p></div>''' + table(['Area', 'Decision', 'Layout action', 'Evidence and scope'], rows) + '''<h2>The concrete RX3 candidate</h2><p>On the top layer, start full0.1234mm width on RX3_N at X28.35mm / Y102.238892863mm. Widen the remaining0.370299525mm of its current neck. Keep the earlier BGA escape narrow, preserve both centerlines and keep total lengths unchanged. Both narrow sections then become0.794154583mm. Fresh local top-copper clearance is0.100100mm against the0.10mm rule.</p><p>The current neck-only mismatch loss is0.024–0.082dB at8GHz, and the modeled P/N phase-delay difference is0.056–0.104ps. The proposed change removes the width/neck-length asymmetry in the chosen model, with only0.009–0.013dB loss improvement. It has not been implemented and requires full native DRC if selected.</p><img src="rx3-neck-proposal.png" alt="Local PCIe RX3 candidate widening, without board edits"><p>Primary layout guidance: <a href="https://www.ti.com/document-viewer/lit/html/SSZTAX3/GUID-2D2CAEAA-D7FA-43E3-8CAD-78D810632034">TI: symmetric necking with equal neck lengths</a>. This is design guidance, not evidence that this lane fails a compliance test.</p><h2>Fresh board continuity check</h2><p>A supply-copper edit appeared after the original screening snapshot. A fresh PCB-only build confirms all12 signal routes unchanged to1e-10mm, unchanged GND vias, exactly unchanged L2/L5 plane shapes and passing routing audits. Changed top copper is at least0.91834mm from the data-channel copper, above the0.736mm checked-trunk isolation threshold. This establishes the stated geometric applicability of the focused line calculations; it does not establish unchanged3D launch fields.</p><p>Fresh board SHA-256: <code>''' + current + '''</code><br>Frozen numerical-input SHA-256: <code>''' + frozen + '''</code><br>Selected stackup SHA-256: <code>''' + stack + '''</code></p><h2>What the checks establish</h2><ul>''' + paragraphs + '''</ul><h2>Numerical controls</h2>''' + controls + '''<p>Numerical controls validate the implementations and declared numerical sensitivity. They do not validate every physical assumption or provide production failure statistics.</p><h2>Evidence</h2><p><a href="results.json">Decisions and input hashes</a> · <a href="necks.json">Finite neck calculations and candidate clearance</a> · <a href="return-paths.json">Ground topology, ESD returns and optional stitches</a> · <a href="loss-loading.json">Loss and loading decomposition</a> · <a href="crosstalk.json">Independent coupled-trunk stress model</a> · <a href="current-input-comparison.json">Fresh geometry comparison</a> · <a href="../fast-screening/report.html">Original12-path screen</a></p><p>Board copper and component placement were not changed. No native3D FDTD solve was launched for this focused review.</p></main></html>'''
    (OUT / 'report.html').write_text(page)
    print(json.dumps({'report': str(OUT / 'report.html'), 'mandatoryReroutesEstablished': 0, 'recommendedLocalCleanups': 1, 'numericalControlsPassed': len(necks['numericChecks']) + len(loss['numericChecks']) + len(xtalk['controls'])}))


if __name__ == '__main__':
    main()
