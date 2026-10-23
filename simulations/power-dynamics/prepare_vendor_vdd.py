"""Prepare source-bound VDD test decks for TI's encrypted PSpice model.

Preparation is not a simulation result. A compatible PSpice installation must
run the generated decks before their voltage measurements can be assessed.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
VENDOR = Path(__file__).with_name('vendor') / 'tps62903'
PARTS = {'CL21A106KAYNNNE': 'cl21a106', 'CL05A225KO5NQNC': 'cl05a225',
         'CL05B224KO5NNNC': 'cl05b224'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def chart(curves, part, kind, subtype=None):
    return next(c for c in curves[PARTS[part]]['data'][kind]['charts']
                if subtype is None or c.get('graphSubType') == subtype)


def interp(c, value, log=False):
    xy = sorted((float(p['x']), float(p['y'])) for p in c['data'])
    x, y = np.array(xy).T
    assert x[0] <= value <= x[-1], (value, x[0], x[-1])
    return float(np.interp(np.log10(value) if log else value,
                           np.log10(x) if log else x, y))


def cap_values(curves, cap, voltage, profile):
    part, nominal = cap['manufacturer_part_number'], cap['capacitance']
    dc = 1 + interp(chart(curves, part, 'DCBias'), voltage) / 100
    ac = 1 + interp(chart(curves, part, 'ACVolt'), .01) / 100
    factors = {'typical_dc': dc, 'reduced': dc * ac * .9 * .85}
    esr = interp(chart(curves, part, '|Z|_R', 'R'), 2.5, log=True)
    f = 50e6
    z = interp(chart(curves, part, '|Z|_R', '|Z|'), f/1e6, log=True)
    r = interp(chart(curves, part, '|Z|_R', 'R'), f/1e6, log=True)
    esl = math.sqrt(max(0, z*z-r*r))/(2*math.pi*f) + 1/((2*math.pi*f)**2*nominal)
    return dict(name=cap['name'], part=part, nominalF=nominal,
                capacitanceF=nominal*factors[profile], esrOhm=esr,
                intrinsicEsLH=esl)


def deck(case, caps, parts, link_r):
    target = .6*(1+parts['R_VDD_FBT']['resistance']/parts['R_VDD_FBB']['resistance'])
    lines = [f"Flamingo VDD - {case['name']}",
             '* GENERATED TEST DECK; NO SIMULATION RESULT IS IMPLIED.',
             '* TI TPS62903_TRANS pin order: EN FB_VSET GND MODE_SCONF PG SS_TR SW VIN VOS',
             '.LIB "TPS62903_TRANS.LIB"',
             '.OPTIONS RELTOL=0.001 VNTOL=1u ABSTOL=1n ITL4=1000',
             f"V_INPUT vin 0 PWL(0 0 1u 0 11u {case['vinV']:.12g})",
             'V_ENABLE en 0 PWL(0 0 30u 0 30.1u 3.3)',
             'X_BUCK en fb 0 mode pg ss sw vin vout TPS62903_TRANS',
             '* PG and SS/TR have no external connections, as on the board.',
             f"R_MODE mode 0 {parts['R_VDD_MODE']['resistance']:.12g}",
             f"R_FBT vout fb {parts['R_VDD_FBT']['resistance']:.12g}",
             f"R_FBB fb 0 {parts['R_VDD_FBB']['resistance']:.12g}",
             f"R_LDCR sw inductor {case['dcrOhm']:.12g}",
             f"L_VDD inductor vout {case['inductanceH']:.12g}",
             '* Input capacitance uses nominal BOM values; input source is ideal.',
             f"C_INPUT vin 0 {parts['C_VDD_CIN']['capacitance']:.12g}",
             f"C_INPUT_HF vin 0 {parts['C_VDD_HF']['capacitance']:.12g}",
             f'R_DISTRIBUTION vout link {link_r:.12g}',
             f"L_DISTRIBUTION link load {case['linkNH']*1e-9:.12g}",
             '* Each output capacitor has its own series ESR and ESL branch.']
    for c in caps:
        stem = c['name']
        node = 'vout' if '_COUT' in stem else 'load'
        lines.extend([f"R_{stem} {node} {stem}_r {c['esrOhm']:.12g}",
                      f"L_{stem} {stem}_r {stem}_l {c['intrinsicEsLH']+case['mountNH']*1e-9:.12g}",
                      f"C_{stem} {stem}_l 0 {c['capacitanceF']:.12g}"])
    if case['kind'] == 'startup':
        # A resistive startup fixture avoids demanding nonzero power at zero V.
        lines.append(f"R_LOAD load 0 {target/case['loadA']:.12g}")
    else:
        lo, hi, edge = case['lowA'], case['highA'], case['edgeNS']*1e-9
        lines.append(f'I_LOAD load 0 PWL(0 0 300u 0 310u {lo:.12g} '
                     f'700u {lo:.12g} {700e-6+edge:.12g} {hi:.12g} '
                     f'1200u {hi:.12g} {1200e-6+edge:.12g} {lo:.12g} 2m {lo:.12g})')
        lines.extend(['.MEAS TRAN VDD_UP_MIN MIN V(load) FROM=699u TO=1000u',
                      '.MEAS TRAN VDD_RELEASE_MAX MAX V(load) FROM=1199u TO=1500u'])
    lines.extend(['.TRAN 5n 2m 0 5n', '.PROBE V(vout) V(load) V(sw) I(L_VDD)',
                  '.MEAS TRAN VDD_FINAL AVG V(load) FROM=1800u TO=2000u',
                  '.MEAS TRAN VDD_START_MAX MAX V(load) FROM=30u TO=699u', '.END', ''])
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--board', default='dist/si-channel-review/tx3-coordinated/after.circuit.json')
    parser.add_argument('--out', default='dist/tps62903-vdd-review-2026-10-22')
    parser.add_argument('--dc', help='Fresh VDD-only DC result for the same board snapshot')
    args = parser.parse_args()
    out = ROOT/args.out
    out.mkdir(parents=True, exist_ok=True)
    board_path = ROOT/args.board
    board = json.loads(board_path.read_text())
    parts = {p['name']: p for p in board if p.get('type') == 'source_component'}
    assert parts['VDD_BUCK']['manufacturer_part_number'] == 'TPS62903RPJR'
    assert parts['R_VDD_MODE']['resistance'] == 8870
    cap_parts = [p for name,p in parts.items() if name.startswith('C_VDD_')
                 and (name.split('_')[-1].isdigit() or '_COUT' in name)]
    assert len(cap_parts) == 20
    assert abs(sum(p['capacitance'] for p in cap_parts)-75.08e-6) < 1e-12
    curves_path = Path(__file__).with_name('reference-curves.json')
    curves = json.loads(curves_path.read_text())
    dc_path = ROOT/(args.dc or 'manufacturing/power-distribution/vdd-distribution-review-2026-10-22.json')
    dc = json.loads(dc_path.read_text())
    if args.dc:
        assert dc['sourceSha256'] == digest(board_path), 'DC and board snapshots differ'
        assert dc['rail'] == 'VDD' and dc['currentA'] == 3
        link_r = dc['screeningUpperDropMV']/1000/dc['currentA']
        dc_provenance = 'Fresh VDD-only DC screen on this exact board snapshot.'
    else:
        link_r = next(r['afterMV']/1000/r['currentA'] for r in dc['rails'] if r['rail']=='VDD')
        dc_provenance = 'Prior VDD-only DC screen. Board copper preservation must be checked before transferring this resistance to the TX3 snapshot.'
    lib_path = VENDOR/'TPS62903_PSPICE_TRANS/TPS62903_TRANS.LIB'
    lib = lib_path.read_text()
    assert '.SUBCKT TPS62903_TRANS EN FB_VSET GND MODE_SCONF PG SS_TR SW VIN VOS' in lib
    assert '$CDNENCSTART_ADV2' in lib
    shutil.copyfile(board_path, out/'board.circuit.json')
    shutil.copyfile(lib_path, out/'TPS62903_TRANS.LIB')
    shutil.copyfile(lib_path.with_suffix('.LIBsig'), out/'TPS62903_TRANS.LIBsig')
    cases = []
    base = dict(vinV=5., inductanceH=1e-6, dcrOhm=.009, linkNH=5., mountNH=.2,
                profile='typical_dc')
    for profile in ['typical_dc', 'reduced']:
        for low in [1.5, .3]:
            cases.append(dict(base, kind='load', profile=profile, lowA=low, highA=3., edgeNS=200,
                              name=f"load-{profile}-{low:g}-to-3A"))
    cases.extend([
        dict(base, kind='load', profile='reduced', vinV=4.75, inductanceH=.72e-6,
             dcrOhm=.009*(1+.00393*100), linkNH=20., mountNH=1., lowA=.3, highA=3.,
             edgeNS=200, name='load-low-vin-reduced-cap-low-L-high-parasitics'),
        dict(base, kind='load', profile='reduced', vinV=5.25, inductanceH=1.2e-6,
             linkNH=20., mountNH=1., lowA=.3, highA=3., edgeNS=200,
             name='load-high-vin-reduced-cap-high-L-high-parasitics'),
        dict(base, kind='load', profile='reduced', lowA=.3, highA=3., edgeNS=1000,
             name='load-reduced-1us-edge'),
        dict(base, kind='load', profile='reduced', lowA=.3, highA=3., edgeNS=10000,
             name='load-reduced-10us-edge'),
    ])
    for load in [.1, 1.5, 3.]:
        cases.append(dict(base, kind='startup', profile='reduced', loadA=load,
                          name=f'startup-resistive-{load:g}A-at-target'))
    rows = []
    for case in cases:
        caps = [cap_values(curves, p, 1.130578512396694, case['profile']) for p in cap_parts]
        text = deck(case, caps, parts, link_r)
        path = out/(case['name']+'.cir')
        path.write_text(text)
        rows.append(dict(case, file=path.name, sha256=digest(path),
                         totalEffectiveCapacitanceUF=sum(c['capacitanceF'] for c in caps)*1e6,
                         capacitors=caps, executionStatus='not_run'))
    result = dict(status='prepared_not_simulated', boardFile=args.board,
                  boardSha256=digest(board_path), modelFile=str(lib_path.relative_to(ROOT)),
                  modelSha256=digest(lib_path), pinOrder=['EN','FB_VSET','GND','MODE_SCONF','PG','SS_TR','SW','VIN','VOS'],
                  targetVoltageV=.6*(1+10700/12100), checkedPinVoltageWindowV=[1.10,1.16],
                  loadBudgetA=3., fixedCurrentDemandDuringStartup=False,
                  distributionResistanceOhm=link_r,
                  distributionResistanceSource=str(dc_path.relative_to(ROOT)),
                  distributionSourceBoardSha256=dc['sourceSha256'],
                  distributionProvenance=dc_provenance,
                  cases=rows, inputSha256={str(p.relative_to(ROOT)):digest(p) for p in
                      [board_path,curves_path,dc_path,lib_path,Path(__file__)]},
                  limitations=[
                      'No regulator simulation has run. Prepared decks cannot establish voltage margins or pass/fail.',
                      'TI PSpice model is encrypted and cannot run in ngspice. TI SIMPLIS model is also encrypted.',
                      'Nominal controller behavior only: TI does not model temperature-dependent characteristics.',
                      'Output capacitor curves are typical. Reduced capacitance and parasitic values are sensitivity assumptions, not guaranteed limits.',
                      'Each branch uses fixed ESR and ESL fitted at 2.5 MHz and 50 MHz; no full frequency-dependent capacitor model.',
                      'Output interconnect is lumped; ground/package impedance and uneven supply-ball loading are omitted.',
                      'VOS/FB sense the local regulator output; actual load-current steps remain unknown.',
                      'Input is ideal with nominal local bypass capacitance; upstream source dynamics are omitted.',
                      'Inductor inductance is constant per case. Core loss, saturation and thermal feedback are not modeled.',
                      'Startup uses resistive loads at rated final current; it does not emulate chip startup demand.',
                      'Internal reference and feedback tolerance corners need separate assessment after nominal waveforms are available.',
                      'Run the nominal cases at 2.5 ns maximum step as a numerical control, and allow longer settling if needed.'
                  ])
    (out/'prepared-testbench.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['status','boardSha256','targetVoltageV','distributionResistanceOhm']},indent=2))
    print(f'Prepared {len(cases)} PSpice decks; none has been simulated.')


if __name__ == '__main__':
    main()
