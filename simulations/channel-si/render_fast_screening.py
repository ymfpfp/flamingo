"""Combine the selected-stackup screens without promoting them to SI sign-off."""
import csv
import hashlib
import html
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'dist/si-channel-review/fast-screening'
INPUT = ROOT / 'dist/si-channel-review/selected-stackup-inputs'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def table(heads, rows):
    esc = lambda v: html.escape(str(v))
    return '<div class="scroll"><table><thead><tr>' + ''.join('<th>' + esc(v) + '</th>' for v in heads) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join('<td>' + esc(v) + '</td>' for v in row) + '</tr>' for row in rows) + '</tbody></table></div>'


def main():
    g = read(INPUT / 'geometry.json')
    validation = read(INPUT / 'validation.json')
    usb = read(OUT / 'USB4-screen.json')
    pcie = read(OUT / 'PCIe-screen.json')
    tline = read(OUT / 'component-tline-results.json')
    duplicates = read(OUT / 'duplicate-cases.json')
    candidates = read(OUT / 'reduced-native-candidates.json')
    assert duplicates['complete']
    assert sha(OUT / 'duplicate-cases.json') == candidates['proofFileSha256']
    counts = candidates['counts']
    removed = duplicates['removedDuplicateJobs']
    assert counts['beforeTotal'] - counts['afterTotal'] == removed
    assert len(candidates['jobs']) == counts['afterTotal']
    assert not duplicates['nativeDataCopiedOrSymlinkedToAliases']
    board_hash = sha(INPUT / 'board.circuit.json')
    handoff_hash = sha(INPUT / 'field-solver-handoff.json')
    stack_hash = sha(INPUT / 'selected.json')
    assert sha(ROOT / 'manufacturing/stackup/selected.json') == stack_hash
    assert validation['passed'] and validation['sourceSha256'] == board_hash
    assert g['sourceSha256'] == board_hash
    assert all(a['passed'] for a in g['audits'].values())
    for name, data in [('USB4', usb), ('PCIe', pcie), ('TLine', tline), ('deduplication', duplicates)]:
        assert data['sourceSha256'] == board_hash, (name, 'board binding')
        assert data['handoffSha256'] == handoff_hash, (name, 'handoff binding')
        assert data.get('stackupSha256', data.get('selectedStackupSha256')) == stack_hash, (name, 'stackup binding')
    assert all(c['passed'] for c in tline['numericChecks'])
    names = {c['name'] for c in g['channels']}
    assert len(names) == 12
    screens = {c['name']: c for c in usb['channels'] + pcie['channels']}
    numeric = {c['name']: c for c in tline['summary']}
    assert set(screens) == set(numeric) == names
    assert not tline.get('fullChannelVerified', False)
    assert not tline.get('full3DSolverRun', False)
    rows, channels = [], []
    for c in g['channels']:
        n = c['name']
        a = screens[n]
        s = numeric[n]
        lengths = [d['lengthMm'] for d in c['conductors']]
        vias = [d['viaCount'] for d in c['conductors']]
        il = s['insertionLossSensitivityAtNyquistDB']
        rl = s['returnLossSensitivityAtNyquistDB']
        findings = a.get('findings', [])
        channels.append({'name': n, 'lengthsMm': lengths, 'skewMm': abs(lengths[0] - lengths[1]), 'viaCountsPerConductor': vias, 'nyquistGHz': s['nyquistGHz'], 'insertionLossSensitivityAtNyquistDB': il, 'returnLossSensitivityAtNyquistDB': rl, 'screenVerdict': a.get('screenVerdict', 'unknown'), 'checks': a.get('checks', []), 'findings': findings, 'fullChannelVerified': False})
        rows.append([n, f'{max(lengths):.3f}', f'{abs(lengths[0]-lengths[1]):.6f}', '/'.join(str(v) for v in vias), s['nyquistGHz'], f'{il[0]:.2f}–{il[1]:.2f}', f'{rl[0]:.2f}–{rl[1]:.2f}', a.get('screenVerdict', 'unknown')])
    files = [INPUT / 'board.circuit.json', INPUT / 'geometry.json', INPUT / 'field-solver-handoff.json', INPUT / 'selected.json', INPUT / 'validation.json', OUT / 'USB4-screen.json', OUT / 'PCIe-screen.json', OUT / 'component-tline-results.json', OUT / 'duplicate-cases.json', OUT / 'reduced-native-candidates.json', Path(__file__)]
    report = {'createdUTC': datetime.now(timezone.utc).isoformat(), 'scope': 'All twelve PCB paths screened on the selected stackup; reduced models and geometric checks, without complete 3D or assembled-channel qualification.', 'sourceSha256': board_hash, 'handoffSha256': handoff_hash, 'stackupSha256': stack_hash, 'channelCount': 12, 'routingAuditsPassed': True, 'numericChecksPassed': True, 'full3DSolverRun': False, 'fullChannelVerified': False, 'eyeOrBERVerified': False, 'firstTrySuccessProbability': None, 'probabilityNote': 'This deterministic screen does not provide calibrated population failure statistics or a defensible first-build probability.', 'channels': channels, 'duplicateCases': duplicates, 'inputSha256': {str(p.relative_to(ROOT)): sha(p) for p in files}}
    (OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    with (OUT / 'channel-summary.csv').open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['channel', 'maximum_copper_mm', 'skew_mm', 'vias_P_N', 'nyquist_GHz', 'IL_sensitivity_dB', 'RL_sensitivity_dB', 'screen_verdict'])
        writer.writerows(rows)
    e = html.escape
    sections = []
    for c in channels:
        a = screens[c['name']]
        checks = table(['Check', 'Status', 'Evidence / limit'], [[v.get('name', ''), v.get('status', 'unknown'), json.dumps({k: z for k, z in v.items() if k not in ('name', 'status')}, ensure_ascii=False) if len(v) > 2 else 'See path scope below.'] for v in a.get('checks', [])])
        findings = ''.join('<li>' + e(v.get('status', 'review').upper()) + ': ' + e(v.get('message', str(v))) + '</li>' if isinstance(v, dict) else '<li>' + e(str(v)) + '</li>' for v in a.get('findings', []))
        scope = ' '.join(str(a.get(k, {}).get('scope', '')) for k in ['referencePlaneProjection', 'nearbyCopper'])
        if a.get('nearbyCopper', {}).get('excludedLaunchRuns'):
            scope += ' Launch regions excluded from the isolation rule: ' + json.dumps(a['nearbyCopper']['excludedLaunchRuns'], ensure_ascii=False)
        sections.append('<details><summary>' + e(c['name']) + ' — ' + e(str(c['screenVerdict'])) + '</summary>' + checks + '<p>' + e(scope) + '</p><ul>' + findings + '</ul></details>')
    plots = ''.join('<figure><img src="' + e(p.name) + '" alt="' + e(p.stem.replace('-', ' ')) + '"></figure>' for p in OUT.glob('*.png') if p.name in ('channel-loss-sensitivity.png', 'channel-return-loss.png', 'usb4-return-paths.png'))
    controls = table(['Numerical control', 'Result'], [[v['name'], 'PASS' if v['passed'] else 'FAIL'] for v in tline['numericChecks']])
    limitations = '<ul>' + ''.join('<li>' + e(str(v)) + '</li>' for v in tline.get('limitations', [])) + '</ul>'
    duplicate_view = '<pre>' + e(json.dumps({k: v for k, v in duplicates.items() if k not in ('models', 'comparisons')}, indent=2)) + '</pre>'
    duplicate_count_text = (f'{removed} exact duplicate local jobs removed: {counts["beforeTotal"]} candidates become {counts["afterTotal"]}. ' if removed else 'No exact duplicate local jobs were proven; all distinct candidates are retained. ')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Flamingo — fast SI screening</title><style>
body{margin:0;background:#f5f7fa;color:#173044;font:16px/1.55 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:30px 24px 70px}h1{font-size:34px;line-height:1.2}h2{margin-top:34px}.callout{background:#fff0d9;border-left:5px solid #ad691b;padding:18px 22px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;background:white;margin:16px 0;font-size:14px}th,td{padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid #dce3e9}th{background:#e4edf3}code{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}details{background:white;padding:14px 18px;margin:10px 0}summary{cursor:pointer;font-weight:650}img{max-width:100%}figure{margin:20px 0}a{color:#075e96}li{margin:7px 0}</style><main>
<p>Selected fabrication stackup · ''' + e(report['createdUTC']) + '''</p><h1>USB4 and PCIe: fast screening review</h1>
<div class="callout"><strong>The screening review is complete for all 12 PCB paths. Full SI sign-off remains open.</strong><p>Routing length, pair matching and via-count checks pass. The reduced models retain launch, return-path and component-model uncertainties. No channel is declared compliant from this screen.</p></div>
<p>This review replaces the exhaustive run queue. It uses fast geometric audits, selected-stackup 2D cross-sections and component-aware transmission-line sensitivity models. Every complete USB4 and PCIe path remains an individual result. Equivalent local cases share one candidate model only after an explicit comparison.</p>
<h2>Coverage and construction</h2><p>Selected construction: JLC061611-3313G, 0.092 mm outer dielectric and 0.030 mm inner copper. The outer trace cross-section uses the documented 0.04064 mm finished-copper guide model, separately from 0.035 mm foil. Earlier 0.0994 mm / 0.0152 mm-inner-copper results do not clear this construction.</p>
<p>Board SHA-256: <code>''' + board_hash + '''</code><br>Stackup SHA-256: <code>''' + stack_hash + '''</code></p>
<h2>Findings that deserve attention</h2><ul><li><strong>Basic routing passes on all 12 paths.</strong> Nominal straight-section impedance screens near 85.1–85.2 ohms. Width, length, pair matching and via-count audits pass. The independent ground-plane projection and checked-route isolation screens are recorded per path below.</li><li><strong>USB4 RX2 has the smallest loss headroom in the tested scenarios.</strong> Its 10 GHz loss sensitivity is 1.30–3.81 dB against the ASMedia 4 dB routing guidance. The 0.19 dB difference in the highest-loss scenario is not a verified physical margin. Its minimum return loss at 10 GHz is about 5.73 dB in the tested scenarios; no assembly return-loss mask is applied at these PCB ports.</li><li><strong>PCIe TX3 is the longest data path.</strong> Its 8 GHz loss sensitivity is 4.01–9.60 dB. A board-only PCIe acceptance limit has not been assigned; material and transition assumptions need confirmation before judging margin.</li><li><strong>USB4 return stitching remains a review point.</strong> Five signal-via positions on TX1, RX1 and RX2 exceed the assumed 1 mm proximity trigger. RX1 reaches 1.807 mm. Distance alone does not establish return-loop impedance or a standards failure.</li><li><strong>Short narrow necks remain unresolved transitions.</strong> USB4 TX2/RX1 and PCIe RX3 contain 0.0762 mm trace sections. Selected-height uniform neck proxies screen near 100–130 ohms, depending on assumed coupling. These are not finite-launch impedances.</li></ul>
<h2>All complete PCB paths</h2><p>Lengths are planar routed copper per conductor. They exclude package delay, connector internals, capacitor pad span and via depth. IL is insertion loss (lower is better). RL is positive return loss (higher is better). The displayed ranges are outcomes of assumed sensitivity scenarios, not verified physical bounds or confidence intervals. A warning or unknown indicates unresolved screening coverage, not a demonstrated hardware failure.</p>
''' + table(['Path', 'Max length mm', 'P/N skew mm', 'Vias P/N', 'Nyquist GHz', 'IL sensitivity dB', 'RL sensitivity dB', 'Verdict'], rows) + plots + '''
<h2>Findings by path</h2>''' + ''.join(sections) + '''
<h2>Exact duplicate comparison</h2><p>''' + e(duplicate_count_text) + '''<a href="reduced-native-candidates.json">The reduced candidate manifest</a> contains the retained optional native jobs and any proven aliases. It is not an active simulation queue. <a href="../selected-stackup-channels/superseded-by-screening.json">The old exhaustive queue is disabled</a>. Larger-region studies and complete paths are kept separate when their geometry differs. No native numerical results were copied to aliases. <a href="duplicate-cases.json">All full-precision comparisons</a>.</p><details><summary>Exact comparison and case counts</summary>''' + duplicate_view + '''</details>
<h2>Numerical checks and limits</h2>''' + controls + '''<p>These controls test the reduced network implementation. They do not validate the physical launch assumptions. Cross-channel crosstalk, connector/package internals, transmitter/receiver equalization, loaded eye and BER remain unresolved. No first-build success percentage can be calibrated from these simulations alone.</p>''' + limitations + '''
<h2>Evidence</h2><p><a href="results.json">Combined results and input hashes</a> · <a href="channel-summary.csv">Channel table</a> · <a href="USB4-screen.json">USB4 screen</a> · <a href="PCIe-screen.json">PCIe screen</a> · <a href="component-tline-results.json">All reduced-model scenarios</a> · <a href="duplicate-cases.json">Duplicate proof</a> · <a href="../selected-stackup-inputs/validation.json">Selected-input validation</a></p><p>No board copper or component placement changed in this review. The reduced models are frequency-domain sensitivity models; they are not measured or full-field-extracted channel files.</p></main></html>'''
    (OUT / 'report.html').write_text(page)
    print(json.dumps({'report': str(OUT / 'report.html'), 'channels': len(channels), 'numericChecks': len(tline['numericChecks']), 'routingAuditsPassed': True, 'fullChannelVerified': False}))


if __name__ == '__main__':
    main()
