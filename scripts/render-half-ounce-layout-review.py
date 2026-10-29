"""Render the checked 2026-10-27 layout review; never create fabrication approval."""
import hashlib
import html
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/half-ounce-layout-2026-10-27'


def read(path):
    return json.loads((ROOT / path).read_text())


def digest(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def save(path, value):
    (ROOT / path).write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def plot_copper():
    import matplotlib
    matplotlib.use('Agg')
    from matplotlib import pyplot as plt
    from matplotlib.path import Path as MPath
    from matplotlib.patches import PathPatch, Patch
    from shapely.geometry.polygon import orient
    from shapely.ops import unary_union
    sys.path.insert(0, str(ROOT / 'simulations/power-distribution'))
    from check_layout import model
    colors = {'VCCL': '#cf731a', 'VDD': '#ba3d4b', 'SLOT_12V': '#d6b330',
              'SLOT_3V3': '#3c9a78', 'VCCH': '#7963b9', 'V5V': '#3789bd'}
    fig, axes = plt.subplots(2, 2, figsize=(11, 11), layout='constrained')
    for row, (file, title) in enumerate([
        ('before/board.circuit.json', 'Original layout'),
        ('final.circuit.json', 'Revised layout')
    ]):
        m = model(json.loads((OUT / file).read_text()))
        for col, layer in enumerate(['inner2', 'inner3']):
            ax = axes[row, col]
            for name, color in colors.items():
                shape = unary_union([o['shape'] for o in m[7]
                                     if o['net'] == m[8][name] and layer in o['layers']])
                for poly in getattr(shape, 'geoms', [shape]):
                    if poly.is_empty or poly.geom_type != 'Polygon':
                        continue
                    poly = orient(poly, sign=1)
                    vertices, codes = [], []
                    for ring in [poly.exterior, *poly.interiors]:
                        xy = list(ring.coords)
                        vertices.extend(xy)
                        codes.extend([MPath.MOVETO] + [MPath.LINETO]*(len(xy)-2) + [MPath.CLOSEPOLY])
                    ax.add_patch(PathPatch(MPath(vertices, codes), facecolor=color, edgecolor='none'))
            ax.set(xlim=(0, 52.5), ylim=(123, 70), xlabel='Board X (mm)', ylabel='Board Y (mm)',
                   title=f'{title}: {"L3" if col == 0 else "L4"} power copper')
            ax.set_aspect('equal')
            ax.grid(alpha=.15)
    fig.legend(handles=[Patch(color=c, label=n) for n, c in colors.items()],
               loc='outside lower center', ncol=6)
    fig.savefig(OUT / 'power-copper.png', dpi=170)
    plt.close(fig)


def render():
    prefix = 'dist/half-ounce-layout-2026-10-27/'
    board_sha = digest(prefix + 'final.circuit.json')
    validation = read('dist/validation/board.json')
    assert validation['passed'], 'Full board validation has not passed'
    assert validation['sourceSha256'] == board_sha
    dc = read(prefix + 'core-dc.json')
    assert dc['sourceSha256'] == board_sha
    loads = read('simulations/power-dynamics/provisional-loads.json')
    planned = []
    for r in dc['results']:
        amps = loads['rails'][r['rail']]['designCurrentA']
        drop = r['screeningUpperDropMV'] * amps / r['currentA']
        assert r['coarse']['numericalControls']['passed'] and r['fine']['numericalControls']['passed']
        planned.append(dict(rail=r['rail'],currentA=amps,upperDropMV=drop,
                            limitMV=8,passed=drop <= 8,
                            retained3AStressUpperDropMV=r['screeningUpperDropMV']))
    assert all(r['passed'] for r in planned)
    pcie = read('dist/pcie-si/report.json')
    usb = read('dist/usb4-si/report.json')
    channels = read('dist/si-channel-review/results.json')
    power = read(prefix + 'power/results.json')
    controls = read(prefix + 'control-impedance.json')
    for report, key in [(pcie,'source_sha256'),(usb,'source_sha256'),
                        (channels,'sourceSha256'),(power,'sourceSha256'),(controls,'sourceSha256')]:
        assert report[key] == board_sha
    assert controls['passed'] and all(c['passed'] for c in channels['numericChecks'])
    assert all(c['passed'] for c in power['numericChecks'])
    tests = (OUT / 'tests.log').read_text()
    assert '171 pass' in tests and '0 fail' in tests
    preserve = read(prefix + 'preservation.json')
    assert preserve['passed'] and preserve['allOnTop']
    prior = read('dist/stackup-half-ounce-review-2026-10-26/power.json')
    prior_dynamic = read('dist/stackup-half-ounce-review-2026-10-26/dynamics-selected/results.json')
    copied = {'validation.json':'dist/validation/board.json',
              'slot-dc.json':'dist/slot-power-routing/dc-audit.json',
              'atx5v-dc.json':'dist/atx5v-routing/dc-audit.json',
              'pcie-si.json':'dist/pcie-si/report.json',
              'usb4-si.json':'dist/usb4-si/report.json',
              'channel-si.json':'dist/si-channel-review/results.json'}
    for target, source in copied.items():
        (OUT / target).write_bytes((ROOT / source).read_bytes())
    slot = read(prefix + 'slot-dc.json')
    assert slot['sourceSha256'] == board_sha
    files = ['index.circuit.tsx','lib/power-distribution.tsx','lib/pcie-tx-routing.ts',
             'jlcpcb-clearance-rules.json','manufacturing/stackup/selected.json',
             'manufacturing/stackup/cost-reduction-rework.json',
             'manufacturing/power-distribution/requirements.json',
             'manufacturing/power-distribution/terminals.json',
             'manufacturing/power-distribution/bga-copper.json',
             'manufacturing/power-distribution/cost-reduction-copper.json',
             'manufacturing/power-distribution/surface-si-moats.json',
             'manufacturing/control-routing/routed-surface.json',
             'manufacturing/control-routing/cc-pour-clearance.json',
             'manufacturing/atx5v-routing/regions.json',
             'manufacturing/vcch-routing/regions.json','manufacturing/vcch-routing/terminals.json',
             'manufacturing/slot-power-routing/regions.json','manufacturing/slot-power-routing/terminals.json',
             'simulations/power-distribution/check_dc.py','simulations/power-distribution/check_layout.py',
             'simulations/power-distribution/prepare_surface_moats.py','tests/audits/layout-audit.mjs',
             'simulations/pcie-tx/check_asmedia_spacing.py','simulations/usb4/check_layout.py',
             'simulations/bridge-clocks/check_layout.py','tests/layout-preservation.test.mjs',
             'scripts/build-board.mjs','scripts/render-half-ounce-layout-review.py']
    report = dict(dateLocal='2026-10-27',status='Layout and planned-load conductor screens passed; fabrication release open',
        stackupCode='JLC06161H-3313',sourceFile=prefix+'final.circuit.json',sourceSha256=board_sha,
        pcbOnlyBaselineSha256=digest(prefix+'before/board.circuit.json'),
        plannedLoadDc=planned,tests=dict(passed=171,skipped=8,failed=0),preservation=preserve,
        placementAssessment=read(prefix+'placement-assessment.json'),
        nominalDifferentialOhm=pcie['nominal_cross_section']['impedance_ohm'],
        newViaCounts=dict(coreStitches=25,coreFeed=4,flashTransfer=1,slotFeedTransfer=1,total=31),
        changedExistingVddFeedVias=dict(count=8,drillBeforeMm=.2,drillAfterMm=.25,landMm=.4),
        clearances=dict(mainRegionMm=.205,innerViaLandMm=.155,innerViaDrillMinimumMm=.2,
                        componentPthDrillMinimumMm=.3,bgaTopTraceAndPadMm=.15),
        price=dict(barePcbQuantity=5,factoryAssemblyQuantity=2,priorEstimateBeforeShippingTaxUSD=285.01,assumedCouponUSD=30,
                   priorFreightUSD=42.72,priorEstimateWithFreightBeforeTaxUSD=327.73,
                   revisedLayoutQuoted=False,bridgePurchaseExcludedAlreadyPaid=True,
                   bridgeForwardingFreightKnown=False),
        qualification=dict(fabricationReleased=False,vendorDfmAccepted=False,hardwareValidated=False,
                           completeChannelEyeOrBerValidated=False,regulatorClosedLoopValidated=False,
                           vccL3AStressPassed=False),
        openIssues=[
            'VDD load-step sensitivity still violates the voltage limits; the original 1 oz layout also failed this model.',
            'Actual PDX maximum currents and current edges are not verified. The 1 A / 3 A values are provisional design loads.',
            'VCCL retains a separate 3 A stress-screen failure. This is not its accepted 1 A planning load.',
            'Vendor filled/capped-via, BGA pad, mask and stencil acceptance remains open.',
            'The slot 12 V path trades some conductor loss for core-supply width. Cable, connector, hot-FET and thermal margins remain separate.',
            'Full channel 3D, eye/BER, regulator closed-loop response, startup, reset and existing SOA qualification remain separate.'
        ],inputSha256={f:digest(f) for f in files})
    save('manufacturing/half-ounce-layout-review-2026-10-27.json',report)
    save(prefix+'review.json',report)
    rows = ''
    for r in planned:
        old = [next(q for q in c['core'] if q['rail']==r['rail'])['upperDropMV'] for c in prior['cases']]
        rows += f'<tr><td>{r["rail"]}</td><td>{r["currentA"]:g} A</td><td>{old[0]:.3f} mV</td><td>{old[1]:.3f} mV</td><td><b>{r["upperDropMV"]:.3f} mV</b></td><td>8 mV</td></tr>'
    slot_rows = ''.join(f'<tr><td>{r["rail"]}</td><td>{r["currentA"]:g} A</td><td>{r["withMeshAllowanceMV"]:.3f} mV</td></tr>' for r in slot['results'])
    checks = ''.join(f'<li>{html.escape(k)}: {"PASS" if v.get("passed") else "OPEN"}</li>'
                     for k,v in validation['reports'].items() if 'passed' in v)
    dynamic_rows = ''
    for old,new in zip(prior_dynamic['summary'],power['summary']):
        dynamic_rows += f'<tr><td>{new["rail"]}</td><td>{old["minimumRemainingStaticAfterRippleMV"]:.3f} mV</td><td>{new["minimumRemainingStaticAfterRippleMV"]:.3f} mV</td></tr>'
    issues = ''.join(f'<li>{html.escape(s)}</li>' for s in report['openIssues'])
    (OUT/'report.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8">
<title>Flamingo: revised half-ounce layout</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font:16px/1.5 system-ui;max-width:1100px;margin:32px auto;padding:0 24px;color:#20303b}}h1,h2{{line-height:1.2}}h2{{margin-top:32px}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #c8d2d7;padding:9px;text-align:left}}th{{background:#edf2f4}}.ok,.open{{padding:16px;border-left:5px solid #288060;background:#e8f5ed}}.open{{border-color:#b07918;background:#fff1d6}}img{{width:100%;height:auto}}code{{overflow-wrap:anywhere;font-size:12px}}a{{color:#126984}}</style>
<h1>Flamingo: revised half-ounce layout</h1><p>Checked on October 27, 2026. Two assembled boards from a five-PCB quote; all 154 parts remain on top.</p>
<p class="ok"><b>The wider power paths meet the 8 mV conductor budget at the planned loads.</b> The selected construction is JLC06161H-3313: 1 oz outer copper and 0.5 oz inner copper. Both PCIe spacing fixes pass.</p>
<p class="open"><b>Fabrication release remains open.</b> The VDD load-step model still fails. It also failed with the original 1 oz layout. These results do not replace vendor review or hardware tests.</p>
<h2>Power loss at the chip</h2><p>All numbers include the existing mesh allowance, at an assumed copper temperature of 80°C. The provisional loads remain 1 A for VCCL and 3 A for VDD.</p>
<table><tr><th>Rail</th><th>Load</th><th>Original 1 oz</th><th>Unchanged 0.5 oz</th><th>Revised 0.5 oz</th><th>Limit</th></tr>{rows}</table>
<p>The separate VCCL 3 A stress result is {planned[0]['retained3AStressUpperDropMV']:.3f} mV and remains open. The conductor model excludes ground, package and inductor loss. Via plating is still an unconfirmed 0.020 mm assumption.</p>
<h2>What changed</h2><ul><li>Wider inner power regions, extra top and bottom copper, and more connections between layers.</li><li>A second 12 V feed runs along the left side. It frees space for the core supply. The bulk 3.3 V spine is 4.1 mm wide; its continuity and copper loss were rechecked.</li><li>The 5 V trunk is 12 mm wide, up from 6 mm.</li><li>31 added vias. The VDD output now has twelve 0.25 mm drill / 0.40 mm land feed vias.</li><li>The TX1 pair moved 0.028 mm. Its original top launch and via stay fixed. Pair skew is 0.0232 mm, below the unchanged 0.025 mm limit.</li><li>The adjacent CC2 via moved by +0.05 mm in X and −0.05 mm in Y.</li><li>Part choices and component positions are unchanged. Four signal trace records changed; the other original traces are preserved.</li></ul>
<p>Main power-region clearance stays at 0.205 mm. Inner via-land antipads use 0.155 mm; the physical audit still requires 0.20 mm from a via drill and 0.30 mm from a component plated drill. The local BGA top fill uses 0.15 mm trace/pad clearance. This is a local fine-pitch treatment, not a change to the main power-region spacing.</p>
<img src="power-copper.png" alt="Original and revised native power copper on layers three and four">
<h2>Checks</h2><p>171 automated tests pass, with 8 existing optional-fixture skips. Type checking passes. Native copper checks find no shorts or PCB style issues. Normal differential sections are {report['nominalDifferentialOhm']:.2f} Ω; the fabrication target is 76.5–93.5 Ω. Narrow launches and full channels still need separate SI qualification.</p><ul>{checks}</ul>
<p>The PCB placement checker reports zero placement DRC errors and warnings. It retains one orientation advisory for C_VDD_28. Both pads connect vertically through their own vias; the straight-line placement heuristic does not represent those inner-plane paths. See <a href="placement-assessment.json">the assessment</a>.</p>
<h2>Other power paths</h2><table><tr><th>Path</th><th>Model load</th><th>Conductor loss with mesh allowance</th></tr>{slot_rows}</table>
<p>The slot 12 V loss increased from 97.754 mV in the prior half-ounce layout to {next(r['withMeshAllowanceMV'] for r in slot['results'] if r['rail']=='SLOT_12V'):.3f} mV. ATX source tolerance, cables, connectors, hot MOSFETs and temperature still need a complete voltage budget. These are conductor results, not a voltage qualification.</p>
<h2>Supply response</h2><p>The conditional model was rerun, including its independent SPICE numerical check. VDD keeps about the same steady-load voltage margin as the original 1 oz board. Load-step failures remain.</p><table><tr><th>Rail</th><th>Original static margin after ripple</th><th>Revised static margin after ripple</th></tr>{dynamic_rows}</table><p>The VDD 1.5 A step example reaches 1.083 V at the low corner and 1.185 V at the high corner. The assumed passive response is not a validated TPS62903 control-loop model.</p>
<h2>Price</h2><p>The prior estimate was <b>$285.01 before shipping and tax</b>, including the loose parts and an assumed $30 coupon. Prior freight made that $327.73 before tax. Forwarding the already-paid bridge chips remains unpriced. No new assembly parts were added. The revised via count still needs a fresh JLCPCB quote.</p>
<h2>Open work</h2><ul>{issues}</ul>
<h2>Files and evidence</h2><p><a href="flamingo-0p5oz-review.zip">Gerbers for quote and review</a> · <a href="final.circuit.json">Checked Circuit JSON</a> · <a href="review.json">Review and input hashes</a> · <a href="validation.json">Full validation</a> · <a href="core-dc.json">Core conductor model</a> · <a href="slot-dc.json">Slot conductor model</a> · <a href="power/results.json">Supply response</a> · <a href="channel-si.json">Channel sensitivity</a> · <a href="preservation.json">Part and trace preservation</a></p><p><code>Board SHA-256: {board_sha}</code></p></html>''')
    plot_copper()
    print(OUT/'report.html')


if __name__ == '__main__':
    if '--plot-only' in sys.argv:
        plot_copper()
    else:
        render()
