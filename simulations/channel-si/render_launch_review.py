"""Report the applied RX3 edit and the remaining model-limited launch risks."""
from collections import Counter
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
OUT = ROOT / 'dist/si-channel-review/launch-review'
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from copper_geometry import copper_objects


def load(p):
    return json.loads(p.read_text())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def table(heads, rows):
    e = lambda v: html.escape(str(v))
    return '<div class="scroll"><table><thead><tr>' + ''.join('<th>' + e(v) + '</th>' for v in heads) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join('<td>' + e(v) + '</td>' for v in row) + '</tr>' for row in rows) + '</tbody></table></div>'


def plot_change(before, after, board):
    region = box(28.05, 101.32, 29.06, 102.95)
    objects = copper_objects(board)
    fig, axes = plt.subplots(1, 2, figsize=(10, 8), layout='constrained')
    for ax, g, label in zip(axes, [before, after], ['Before: unequal narrow lengths', 'Applied: equal narrow lengths']):
        for obj in sorted(objects, key=lambda v: not v['label'].startswith('pcb_copper_pour')):
            if 'top' not in obj['layers'] or obj['trace'] is not None or not obj['shape'].intersects(region):
                continue
            clipped = obj['shape'].intersection(region)
            for p in [clipped] if clipped.geom_type == 'Polygon' else getattr(clipped, 'geoms', []):
                if p.geom_type != 'Polygon':
                    continue
                ax.add_patch(Patch(list(p.exterior.coords), facecolor='#c9cfd5', edgecolor='white', linewidth=.3))
                for ring in p.interiors:
                    ax.add_patch(Patch(list(ring.coords), facecolor='white', edgecolor='none'))
        channel = next(c for c in g['channels'] if c['name'] == 'PCIE_RX3')
        for leg, color in zip(channel['conductors'], ['#087e8b', '#cf6900']):
            for stage in leg['stages']:
                for s in stage['segments']:
                    if s['layer'] != 'top':
                        continue
                    p = LineString([(s['from']['x'], s['from']['y']), (s['to']['x'], s['to']['y'])]).buffer(s['widthMm'] / 2)
                    if p.intersects(region):
                        ax.add_patch(Patch(list(p.exterior.coords), facecolor=color, edgecolor='none'))
            ax.plot([], [], color=color, linewidth=5, label=leg['polarity'] + f" neck {leg['neckLengthMm']:.6f} mm")
        ax.set(xlim=(28.03, 29.07), ylim=(101.28, 102.97), xlabel='Board X (mm)', ylabel='Board Y (mm)', title=label)
        ax.set_aspect('equal')
        ax.grid(alpha=.15)
        ax.legend(loc='lower left', fontsize=8)
    axes[1].annotate('0.3703 mm suffix\nwidened to 0.1234 mm', xy=(28.35, 102.45), xytext=(28.08, 102.80), fontsize=9, arrowprops={'arrowstyle': '->'})
    fig.suptitle('PCIe RX3 — applied top-copper width change; centerlines unchanged', fontsize=14)
    fig.savefig(OUT / 'rx3-applied.png', dpi=160)
    plt.close(fig)


def main():
    g = load(OUT / 'geometry.json')
    board = load(OUT / 'board.circuit.json')
    native = load(OUT / 'native-checks.json')
    connectors = load(OUT / 'connectors.json')
    pads = load(OUT / 'launch-pads.json')
    package = load(OUT / 'package-bga.json')
    delta = load(OUT / 'rx3-change-geometry.json')
    independent = load(OUT / 'RX3-width-fix-independent.json')
    board_hash = sha(OUT / 'board.circuit.json')
    handoff_hash = sha(OUT / 'field-solver-handoff.json')
    assert g['sourceSha256'] == native['sourceSha256'] == connectors['sourceSha256'] == pads['provenance']['sourceSha256'] == package['provenance']['sourceSha256'] == board_hash
    assert native['passed'] and delta['passed']
    assert connectors['sourceBindingVerified'] and connectors['validation']['allAssertionsPassed']
    assert connectors['requiredLayoutChanges'] == []
    assert pads['provenance']['handoffSha256'] == handoff_hash
    assert pads['provenance']['connectorCompanionSha256'] == sha(OUT / 'connectors.json')
    assert package['provenance']['handoffSha256'] == handoff_hash
    assert not any(c['status'] == 'fail' for c in package['checks'])
    assert all(v['passed'] for v in g['audits'].values())
    rx = next(c for c in g['channels'] if c['name'] == 'PCIE_RX3')
    assert abs(rx['conductors'][0]['neckLengthMm'] - rx['conductors'][1]['neckLengthMm']) < 1e-6
    warnings = Counter(v['rule'] for v in native['drc']['findings'] if v['severity'] == 'warning')
    findings = [
        {'area': 'RX3 width cleanup', 'status': 'Applied and checked', 'decision': 'Final 0.3703 mm of RX3_N widened to0.1234mm. Both narrow lengths are0.794155mm; full route centerlines and lengths are unchanged.', 'additionalLayoutChangeEstablished': False},
        {'area': 'Connector pin mapping and physical land pattern', 'status': 'No additional required edit demonstrated', 'decision': 'Active signal contacts, PCIe land pattern, unused contact isolation and ground/shield paths pass the physical audit. USB-C land extensions differ from the recommended drawing; their modeled benefit from trimming is small and no mandatory SI edit is established.', 'additionalLayoutChangeEstablished': False},
        {'area': 'PCIe connector electrical launch', 'status': 'Main remaining tuning risk; unresolved', 'decision': 'Full-plane isolated2D section is about36.09ohms differential. The2mm patch gives1.16dB reflected insertion loss at8GHz; hypothetical contact/open-remainder scenarios give1.16–2.25dB. These are not extracted connector losses or physical uncertainty bounds. No mandatory plane void or pad shrink is established.', 'additionalLayoutChangeEstablished': False},
        {'area': 'USB4 connector and component-pad launches', 'status': 'No additional required edit demonstrated; finite fields unresolved', 'decision': 'RX2 A-row isolated full-plane patch gives about0.021dB mismatch loss at10GHz. TX2/RX1 B-row pads each overlap an own-launch-via aperture by12.02%; that geometry is excluded from the full-plane case. Keep the actual return geometry until contact-aware verification supports a change.', 'additionalLayoutChangeEstablished': False},
        {'area': 'ASMedia package / BGA integration', 'status': 'Physical audit complete; internal electrical model unavailable', 'decision': 'All24 high-speed ball mappings and273 ball centers match the primary datasheet. All96 GND/GNDA balls connect to both reference planes. All44 signal vias use top–bottom endpoints, with no unused barrel tail. TX3 first top escape is3.081mm onP versus0mm onN; this physical asymmetry and retained lands remain electrically unqualified. Package/PHY internals are unavailable.', 'additionalLayoutChangeEstablished': False},
    ]
    files = [OUT / f for f in ['board.circuit.json', 'geometry.json', 'field-solver-handoff.json', 'native-checks.json', 'connectors.json', 'launch-pads.json', 'package-bga.json', 'rx3-change-geometry.json', 'RX3-width-fix-independent.json', 'native-netlist-source.log', 'schematic-placement.log', 'placement.log', 'shorts.log', 'pcb-style.log', 'typecheck.log']] + [ROOT / 'lib/pcie-rx-routing.ts', ROOT / 'tests/audits/pcie-rx-routing-audit.ts', Path(__file__)]
    result = {'createdUTC': datetime.now(timezone.utc).isoformat(), 'sourceSha256': board_hash, 'handoffSha256': handoff_hash, 'stackupSha256': connectors['stackupSha256'], 'rx3ChangeApplied': True, 'rx3NeckLengthsMm': [v['neckLengthMm'] for v in rx['conductors']], 'nativeDrcErrors': 0, 'nativeDrcWarningCounts': dict(warnings), 'gerberShortsDetected': False, 'additionalRequiredSILayoutChangesEstablished': [], 'findings': findings, 'fullChannelElectricallyQualified': False, 'eyeBEROrFirstBuildProbabilityEstablished': False, 'native3DLaunches': 0, 'inputSha256': {str(p.relative_to(ROOT)): sha(p) for p in files}}
    (OUT / 'results.json').write_text(json.dumps(result, indent=2) + '\n')
    plot_change(load(ROOT / 'dist/si-channel-review/focused-risks/current-inputs/geometry.json'), g, board)
    e = html.escape
    check_rows = [['RX3 neck / full-path geometry', 'PASS', 'Both necks0.794155mm. All24 data conductors retain their route centerlines and lengths. Only RX3_N signal copper was widened.'], ['Native board DRC', 'PASS with warnings', f'Zero errors; {sum(warnings.values())} warnings remain. See warning scope below.'], ['Native netlist and trace continuity', 'PASS', 'Zero findings in the emitted board; source CLI netlist also reports0 errors/0 warnings.'], ['Gerber-derived shorts, all layers', 'PASS', 'No shorts detected.'], ['Schematic placement', 'PASS', 'No schematic placement issues.'], ['PCB placement', 'No DRC error; one heuristic suggestion', 'CLI exit1 flags pre-existing C_VDD_28 orientation. Its algorithm uses nearest connected-port geometry, not actual routed copper. Native placement DRC reports0 errors/0 warnings; actual routed copper passes shorts/clearance. No unrelated capacitor rotation was made.'], ['PCB trace style', 'PASS', 'No counted style issues.'], ['TypeScript', 'PASS', 'tsc --noEmit.'], ['Full launch/package eye/BER', 'UNRESOLVED', 'No package/PHY/mated connector model or validated full finite launch extraction is available.']]
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flamingo — RX3 applied and launch review</title><style>body{margin:0;background:#f5f7fa;color:#173044;font:16px/1.55 system-ui,sans-serif}main{max-width:1150px;margin:auto;padding:30px 24px 70px}h1{line-height:1.2}h2{margin-top:32px}.callout{padding:18px 22px;background:#fff0d9;border-left:5px solid #ac7018}.scroll{overflow:auto}table{width:100%;background:white;border-collapse:collapse;margin:18px 0;font-size:14px}th,td{text-align:left;vertical-align:top;padding:11px;border-bottom:1px solid #dce4ec}th{background:#e5edf3}img{max-width:100%}code{font-size:12px;overflow-wrap:anywhere}a{color:#075b92}li{margin:8px 0}</style><main><p>Post-edit launch review · ''' + e(result['createdUTC']) + '''</p><h1>RX3 cleanup applied; remaining launch risks reviewed</h1><div class="callout"><strong>The RX3 width edit is applied and passes copper checks. No specific additional SI layout change was established.</strong><p>The PCIe connector pad transition remains the main unresolved launch risk. Physical pinout/footprint checks and fast finite-pad models do not establish complete-channel electrical clearance.</p></div>''' + table(['Area', 'Status', 'Decision / evidence'], [[f['area'], f['status'], f['decision']] for f in findings]) + '''<h2>Applied copper change</h2><p>The wider suffix starts at X28.35mm / Y102.238892863mm on the top layer. The earlier narrow BGA escape stays0.0762mm wide. Both necks are now0.794154583mm. Full P/N routes remain36.562041585mm per leg, with no vias. Local widened-tail P/N clearance is0.100100mm against the0.10mm rule.</p><img src="rx3-applied.png" alt="Actual before/after RX3 width edit"><p>The route audit now checks RX3 neck-length equality so that the old asymmetry is detected if reintroduced. All assembled components remain on the top layer.</p><h2>Launch decisions and limits</h2><ul><li>Do not add the isolated pad/stub loss numbers to the earlier lumped full-path model: that would double-count some loading and ignore interacting reflections.</li><li>The strongest PCIe pad mismatch is a reason for contact-aware launch verification. A uniform low-impedance section alone does not establish that the manufacturer footprint is defective or that a ground-plane void improves the assembled channel.</li><li>The USB B-row reference-plane apertures are associated with the connected launch vias. Partial pad coverage does not itself prove a failed return path, and those pads are not represented by the RX2 full-plane cross-section.</li><li>No package electrical S-parameter or PHY/IBIS-AMI model is available. Ball mapping, physical pad/escape geometry and ground connectivity can be checked; internal package loss, reflection and equalized eye/BER remain undetermined.</li><li>The useful fast checks do not identify another justified geometry edit. This statement does not clear the unresolved finite-field and package behavior.</li></ul><h2>Verification</h2>''' + table(['Check', 'Result', 'Scope'], check_rows) + '''<p>Native warning counts: <code>''' + e(json.dumps(dict(warnings))) + '''</code>. They retain requested-width notices for existing necks/tapered routes and the existing BGA process-review notice. Zero DRC errors is not a fabrication-ready claim; filled/capped vias, oblong lands, mask/stencil and the selected fabrication process retain their documented acceptance requirements.</p><p>Board SHA-256: <code>''' + board_hash + '''</code><br>Handoff SHA-256: <code>''' + handoff_hash + '''</code></p><h2>Evidence</h2><p><a href="results.json">Combined result and hashes</a> · <a href="rx3-change-geometry.json">Exact signal-copper delta</a> · <a href="RX3-width-fix-independent.json">Independent RX3 clearance</a> · <a href="native-checks.json">Native DRC / netlist / continuity</a> · <a href="connectors.json">Connector physical audit</a> · <a href="launch-pads.json">Finite pad and contact scenarios</a> · <a href="package-bga.json">Package/BGA integration</a> · <a href="evidence/connector-pcb-topology.png">Connector topology figure</a></p><p>Earlier <a href="../focused-risks/report.html">focused review</a> and <a href="../fast-screening/report.html">12-path screening</a> remain frozen evidence for their stated board versions. No native3D FDTD campaign was launched for this review.</p></main></html>'''
    # Standard numeric-unit spacing in the readable report, without altering identifiers.
    import re
    page = re.sub(r'(\d)(mm|dB|GHz|ps|ohms)\b', r'\1 \2', page)
    (OUT / 'report.html').write_text(page)
    print(json.dumps({'report': str(OUT / 'report.html'), 'rx3Applied': True, 'drcErrors': 0, 'warnings': sum(warnings.values()), 'additionalRequiredSILayoutChangesEstablished': []}))


if __name__ == '__main__':
    main()
