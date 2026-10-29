"""Make the stackup comparison reviewable without changing fabrication inputs."""
import hashlib
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'dist/stackup-half-ounce-review-2026-10-26'


def read(name):
    return json.loads((OUT/name).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def table(headers, rows):
    return '<div class="scroll"><table><thead><tr>'+''.join('<th>'+html.escape(h)+'</th>' for h in headers)+'</tr></thead><tbody>'+''.join(
        '<tr>'+''.join('<td>'+html.escape(str(c))+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table></div>'


def main():
    signal, power, channels = [read(n+'.json') for n in ['signal', 'power', 'channels']]
    dynamic = [read('dynamics-'+n+'/results.json') for n in ['selected', 'half-ounce']]
    assert signal['sourceSha256'] == power['sourceSha256'] == channels['sourceSha256']
    assert all(d['sourceSha256'] == power['sourceSha256'] for d in dynamic)
    controls = read('parameter-controls.json')
    assert all(c['explicitAndDefaultStackAgree'] for c in controls)
    assert all(all(c['passed'] for c in d['numericChecks']) for d in dynamic)
    assert all(c['passed'] for c in channels['numericalChecks'])
    old, new = signal['cases']
    pold, pnew = power['cases']
    spacing = [r for r in new['pcie']['results'] if r['violations']]
    required = new['pcie']['requiredGapMm']
    power_rows = []
    for a, b in zip(pold['core'], pnew['core']):
        power_rows.append([a['rail']+' chip supply', f"{a['currentA']:g} A", f"{a['upperDropMV']:.2f} mV", f"{b['upperDropMV']:.2f} mV", '8 mV project target; candidate exceeds it'])
    for label, rails, current in [('12 V slot path', ['V12V','SLOT_12V'], '5.5 A'), ('3.3 V slot path', ['VCCH','SLOT_3V3'], '3 A')]:
        values = [sum(r['upperDropMV'] for r in c['slot'] if r['rail'] in rails) for c in [pold, pnew]]
        power_rows.append([label, current]+[f'{v:.2f} mV' for v in values]+['Copper only; excludes switch and contact/cable loss'])
    power_rows.append(['5 V feed to the buck converters', '2 A each; 4 A total', f"{max(pold['atx5V']['upperDropMV'].values()):.2f} mV", f"{max(pnew['atx5V']['upperDropMV'].values()):.2f} mV", 'Below 100 mV project target, with less margin'])
    static_rows = []
    for a, b in zip(dynamic[0]['summary'], dynamic[1]['summary']):
        static_rows.append([a['rail'], f"{a['minimumRemainingStaticAfterRippleMV']:.2f} mV", f"{b['minimumRemainingStaticAfterRippleMV']:.2f} mV"])
    channel_rows, loss_deltas = [], []
    for a, b in zip(channels['cases'][0]['channels'], channels['cases'][1]['channels']):
        differences = [y['insertionLossDB']-x['insertionLossDB'] for x, y in zip(a['scenarios'], b['scenarios'])]
        loss_deltas += [dict(name=a['name'], minimumDB=min(differences), maximumDB=max(differences))]
        channel_rows.append([a['name'], f"{a['nyquistGHz']:g} GHz", '–'.join(f'{v:.2f}' for v in a['insertionLossRangeDB'])+' dB', '–'.join(f'{v:.2f}' for v in b['insertionLossRangeDB'])+' dB', f'{min(differences):+.3f} to {max(differences):+.3f} dB'])
    action = [
        'Increase the copper conductance of the two chip supply paths. Wider inner power areas or parallel outer copper are options. Roughly twice the inner path width restores the old cross-sectional copper area where the geometry permits it. This is a sizing estimate, not a checked layout.',
        'Increase clearance beside PCIe TX1_N and TX3_P. The two checked gaps miss the new limit by about 0.016 mm and 0.006 mm. The obstacles are the neighboring PCIe TX2_P route and the ASM_CC2 via. Move copper with useful margin, then recheck both pairs and the CC2 net.',
        'Review the slot supply paths and the 5 V feed. Their losses increase. Include switch, source, connector and ground-return loss before accepting the voltage budget.',
        'Recheck the supply response to load changes. VDD already fails the conditional transient model on the current stackup. The cheaper stackup reduces its margin further. Improving DC copper alone does not prove a cure.',
        'Repeat routing, clearance, reference-plane, impedance, supply and fabrication checks on the revised board. Keep all assembled parts on top and keep the two continuous ground planes.',
    ]
    files = [ROOT/'manufacturing/stackup/selected.json', ROOT/'manufacturing/stackup/JLC06161H-3313.json',
             ROOT/'simulations/pcie-tx/cross_section.py', ROOT/'simulations/pcie-tx/check_asmedia_spacing.py',
             ROOT/'simulations/usb4/check_layout.py', ROOT/'simulations/bridge-clocks/check_layout.py',
             ROOT/'simulations/control-routing/check_impedance.py', ROOT/'simulations/power-distribution/check_dc.py',
             ROOT/'simulations/power-distribution/check_slot_dc.py', ROOT/'simulations/power-distribution/check_atx5v_dc.py',
             ROOT/'simulations/power-distribution/check_ground_returns.py', ROOT/'simulations/power-dynamics/run_review.py',
             ROOT/'simulations/power-dynamics/provisional-loads.json', ROOT/'simulations/power-dynamics/reference-curves.json',
             ROOT/'tests/audits/schematic-audit.mjs', ROOT/'scripts/review-half-ounce-stackup.py',
             ROOT/'scripts/review-half-ounce-channels.py', Path(__file__),
             OUT/'board.circuit.json', OUT/'signal.json', OUT/'power.json', OUT/'channels.json',
             OUT/'dynamics-selected/review-input.json', OUT/'dynamics-selected/results.json',
             OUT/'dynamics-half-ounce/review-input.json', OUT/'dynamics-half-ounce/results.json',
             OUT/'static-voltage-input.json', OUT/'parameter-controls.json']
    manifest = dict(reviewedOn='2026-10-26', status='analysis-complete; candidate-needs-layout-revision',
                    selectedStackup=old['code'], candidateStackup=new['code'], sourceSha256=power['sourceSha256'],
                    productionRecipeChanged=False, boardCopperChanged=False, candidateFabricationReady=False,
                    independent2DImpedanceOhms=[c['lines']['normal']['results'][-1]['impedance_ohm'] for c in [old,new]],
                    spacingChanges=spacing, powerComparison=power_rows, remainingStaticMarginAfterRipple=static_rows,
                    channelInsertionLossChanges=loss_deltas, requiredWork=action,
                    priceUsd=dict(pcb=149.99, partialFactoryAssembly=138.25, loosePartsAfterDiscount=26.77,
                                  beforeShippingAfter30Coupon=285.01, estimatedJlcShipping=32.92,
                                  estimatedLoosePartsShipping=9.80, estimatedDeliveredBeforeTax=327.73,
                                  savingAgainstOriginalEnigPcb=83.79),
                    priceLimits='Two assembled boards plus hand parts; five bare PCBs; already-paid bridge purchases excluded. Shipping and coupon transferred from earlier quotes. Taxes and unpaid bridge forwarding freight remain unknown. No quote for a revised layout has been obtained.',
                    reports={name:str((OUT/(name+'.json')).relative_to(ROOT)) for name in ['signal','power','channels']},
                    inputSha256={str(p.relative_to(ROOT)):sha(p) for p in files})
    (ROOT/'manufacturing/half-ounce-stackup-review-2026-10-26.json').write_text(json.dumps(manifest, indent=2)+'\n')
    body = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flamingo — cheaper stackup check</title><style>
body{margin:0;background:#f3f5f7;color:#183043;font:16px/1.55 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:28px 24px 60px}h1{line-height:1.15}h2{margin-top:30px}.callout{padding:18px 22px;background:#fff1d8;border-left:5px solid #a46c12}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;background:white;font-size:14px;margin:16px 0}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #d8e1e8}th{background:#e5edf3}li{margin:9px 0}a{color:#075b92}code{font-size:12px;overflow-wrap:anywhere}.small{font-size:13px}</style><main>
<p>26 October 2026 · Two-board prototype · Same board geometry</p><h1>Can the cheaper stackup work?</h1>
<div class="callout"><strong>Worth pursuing, but it needs a power-layout revision.</strong><p>The main signal traces remain within the nominal impedance target. Two PCIe clearances need small changes. Thinner inner copper increases supply voltage loss and leaves too little margin to accept the current power layout.</p><p><strong>$285.01 excludes shipping and tax.</strong> With the earlier shipping estimates, the combined cost is <strong>$327.73 before tax</strong>. Any unpaid shipment of the bridge chips to JLCPCB is additional.</p></div>
<h2>What changes in the construction</h2><p>Both options use six layers, the same layer order, top-side components and continuous ground on layers 2 and 5. The outer copper stays the same. The inner copper changes from 0.030 mm to 0.0152 mm. Its DC resistance per square increases by about 97%. The gap from each surface trace to its ground plane changes from 0.092 mm to 0.0994 mm.</p><p>Current recipe: <strong>JLC061611-3313G</strong>. Candidate: <strong>JLC06161H-3313</strong>. These dimensions match the <a href="https://jlcpcb.com/impedance">JLCPCB construction data</a>. ENIG, filled/capped BGA vias, controlled impedance and the specified laminate family remain in the cost estimate.</p>
<h2>Signal results</h2>'''
    body += table(['Check','Current','Cheaper','Meaning'], [
        ['Main differential traces',f"{manifest['independent2DImpedanceOhms'][0]:.2f} Ω",f"{manifest['independent2DImpedanceOhms'][1]:.2f} Ω",'Both within 76.5–93.5 Ω at nominal dimensions. No width change established by this check.'],
        ['PCIe checked-section clearance','Pass','2 of 28 runs fail','Required gap increases from >0.7360 mm to >0.7952 mm.'],
        ['USB4 checked-section clearance','Pass','Pass','Smallest checked gap is 0.795850 mm. Only 0.000650 mm above the candidate rule; increase margin where practical.'],
        ['Clock geometry and clearance','Pass','Pass','Smallest checked foreign-copper gap is 0.806450 mm.'],
        ['50 Ω control traces','52.80 Ω','55.01 Ω','Both inside the project 42.5–57.5 Ω range.'],
    ])
    body += '<p>The line calculations use two mesh sizes. They model straight traces with copper thickness, taper and solder mask. They exclude finite pads, bends, neighboring nets and signal-via fields. The spacing checks keep the existing documented launch exclusions.</p>'
    body += table(['PCIe section','Obstacle','Actual gap','Required gap','Shortfall'], [[r['name'], 'Neighbor PCIe TX2_P route' if 'TX1' in r['name'] else 'ASM_CC2 via', f"{r['minimumGapMm']:.6f} mm", f'>{required:.4f} mm', f"{required-r['minimumGapMm']:.6f} mm"] for r in spacing])
    body += '<h2>Power results</h2><p>These are conservative conductor-drop estimates, including the existing mesh allowance. Copper temperature is fixed at 80 °C. Via spans and inner thicknesses use each recipe. Ground connectivity passes, but ground-return voltage loss is not included.</p>'
    body += table(['Path','Load','Current','Cheaper','Check'], power_rows)
    body += '<p>The 8 mV target is a project allowance. Exceeding it does not prove that a board fails. The full voltage margin also includes converter tolerance, ripple, load changes and ground loss. The accepted chip loads are planning values, not measured ASMedia current limits.</p><h2>Remaining chip voltage margin</h2><p>This combines the current BOM tolerance calculation, the conservative DC drop and the existing conditional ripple model. It retains the existing inductance and capacitance sensitivity assumptions. The values are above the minimum allowed chip voltage; they exclude ground and package loss.</p>'
    body += table(['Supply','Current margin','Cheaper margin'], static_rows)
    body += '<p><strong>VDD has only about 1.5 mV left in this steady-state model.</strong> The load-step model already finds a VDD problem on the current board. The cheaper construction worsens that result. In the existing example with a 50% load increase and a 0.5 µs assumed response delay, VDD falls about 17.4 mV below its minimum on the current construction and about 20.8 mV below it on the candidate, including the modeled ripple. VCCL also loses its remaining margin in that example. This is an assumed-response sensitivity check, not a validated TPS62903 controller simulation or a prediction of a measured failure.</p><h2>Required work before selecting this stackup</h2><ol>'
    body += ''.join('<li>'+html.escape(a)+'</li>' for a in action)+'</ol>'
    body += '<h2>Whole-route passive sensitivity</h2><p>All 12 fresh data routes were checked under both recipes. Each has 27 assumed loss/via scenarios, for 648 cases total. The USB4 loss change stays between about −0.055 dB and +0.026 dB in matched scenarios. The model gives no large signal-loss penalty from this stackup change.</p><p>The ranges below are sensitivity cases. They are not measured loss or certified bounds. Lower insertion loss is better; a negative change means less modeled loss.</p>'
    body += table(['Route','Frequency','Current loss range','Cheaper loss range','Change in matched cases'],channel_rows)
    body += '<p>All passive-model numerical controls pass. The model updates trace impedance, pad capacitance and via-delay proxies for the candidate. It does not extract finite 3D launches, neighboring-pair coupling, inner-power-plane fields or manufacturing variation. Package/PHY and complete connector models remain unavailable. These results do not establish eye-diagram or error-rate compliance.</p><h2>Cost for two boards</h2>'
    body += table(['Item','USD'], [['Five bare PCBs, cheaper recipe, ENIG','149.99'],['Factory assembly of two boards, existing partial split','138.25'],['Parts to hand solder, after parts discount','26.77'],['Subtotal before shipping','315.01'],['Earlier JLCPCB coupon','−30.00'],['Before shipping, after coupon','285.01'],['Earlier JLCPCB shipping estimate','32.92'],['Earlier loose-parts shipping estimate','9.80'],['Estimated delivered cost before tax','327.73']])
    body += '''<p>This includes the hand-assembly parts for both boards. The two bridge-chip purchases are already paid and excluded. PSU, USB4 cable, tools and supplies are outside this budget as requested. Shipping and the coupon are carried over from earlier quotes. Taxes and bridge forwarding freight are not known. No updated layout has been uploaded for a new assembly/shipping quote.</p><h2>Evidence and reproduction</h2><p>The selected recipe and board copper were not changed. The three spacing checks now accept an explicit stackup for comparisons. Their default and explicit-current results agree.</p><p><a href="signal.json">Signal calculations and clearances</a> · <a href="power.json">Power calculations</a> · <a href="channels.json">648 passive channel cases</a> · <a href="dynamics-selected/results.json">Current supply response</a> · <a href="dynamics-half-ounce/results.json">Candidate supply response</a> · <a href="parameter-controls.json">Default-parameter controls</a></p><pre class="small">bun scripts/build-board.mjs dist/stackup-half-ounce-review-2026-10-26/board.circuit.json --pcb-only
bun scripts/prepare-channel-review.mjs dist/stackup-half-ounce-review-2026-10-26/board.circuit.json dist/stackup-half-ounce-review-2026-10-26/signal-inputs
python scripts/review-half-ounce-stackup.py signal
python scripts/review-half-ounce-stackup.py power
python scripts/review-half-ounce-channels.py</pre><p class="small">Python requires simulations/pcie-tx/requirements.txt. Supply-response commands and their explicit inputs are saved in each dynamics folder. Input and solver hashes are in manufacturing/half-ounce-stackup-review-2026-10-26.json.</p><p class="small">Board SHA-256: <code>'''+power['sourceSha256']+'</code></p></main></html>'
    (OUT/'report.html').write_text(body)
    print(OUT/'report.html')


if __name__ == '__main__':
    main()
