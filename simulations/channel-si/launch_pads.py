"""Inspect actual PCB lands and screen finite distributed pad discontinuities.

No native FDTD or board edits. Uniform 2D pad sections do not model contacts,
solder, package internals, pad-edge fringing, or a complete connector launch.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import math
import sys
import time

import numpy as np
from shapely.affinity import rotate
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from cross_section import Section, analyze

EPS0, C0 = 8.8541878128e-12, 299792458.


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def pad_shape(pad):
    x, y = pad['x'], pad['y']
    if pad['shape'] in ['circle', 'circular']:
        return Point(x, y).buffer(pad.get('radius', pad.get('diameter', .2)/2), quad_segs=64)
    w, h = pad['width'], pad['height']
    if pad['shape'] in ['pill', 'rotated_pill']:
        r = min(w, h)/2
        geom = LineString([(x-w/2+r, y-h/2+r), (x+w/2-r, y+h/2-r)]).buffer(r, quad_segs=64)
    elif pad['shape'] in ['rect', 'rotated_rect']:
        geom = box(x-w/2, y-h/2, x+w/2, y+h/2)
    else:
        raise ValueError(pad['shape'])
    return rotate(geom, pad.get('ccw_rotation', 0), origin=(x, y))


def pads_by_channel(g):
    return {channel['name']: [pad for leg in channel['conductors']
        for pads in [leg['startPads'], leg['endPads']]
        + [c.get('pads', c.get('signalPads', [])) for c in leg['components']]
        for pad in pads] for channel in g['channels']}


def land_inventory(g, board):
    planes = {layer: unary_union([Polygon([(v['x'], v['y']) for v in p['brep_shape']['outer_ring']['vertices']],
        [[(v['x'], v['y']) for v in ring['vertices']] for ring in p['brep_shape'].get('inner_rings', [])])
        for p in g['groundPlanes'] if p['layer'] == layer]) for layer in ['inner1', 'inner4']}
    h, er = g['stackup']['dielectrics'][0]['thicknessMm'], g['stackup']['dielectrics'][0]['designDk']
    vias = [v for v in board if v['type'] == 'pcb_via' and 'top' in v['layers']]
    output = []
    for ch in g['channels']:
        for leg in ch['conductors']:
            groups = [('BGA', leg['startPads']), ('connector', leg['endPads'])]
            groups += [(c['kind'], c.get('pads', c.get('signalPads', []))) for c in leg['components']]
            for kind, pads in groups:
                for pad in pads:
                    geom = pad_shape(pad)
                    plane = planes['inner1' if pad.get('layer', 'top') == 'top' else 'inner4']
                    overlap = geom.intersection(plane).area
                    entries = []
                    for stage in leg['stages']:
                        for segment in stage['segments']:
                            a, b = segment['from'], segment['to']
                            endpoints = [(a, b), (b, a)]
                            for inside, outside in endpoints:
                                if math.hypot(inside['x']-pad['x'], inside['y']-pad['y']) > 1e-8:
                                    continue
                                line = LineString([(inside['x'], inside['y']), (outside['x'], outside['y'])])
                                if line.length <= 1e-9:
                                    continue
                                entries.append({'traceId': stage['traceId'], 'layer': segment['layer'],
                                    'widthMm': segment['widthMm'], 'segmentLengthMm': line.length,
                                    'centerlineInsidePadMm': line.intersection(geom).length,
                                    'directionFromPadCenterDegrees': math.degrees(math.atan2(outside['y']-inside['y'], outside['x']-inside['x']))})
                    coincident = [v for v in vias if math.hypot(v['x']-pad['x'], v['y']-pad['y']) < 1e-8]
                    effective = unary_union([geom] + [Point(v['x'], v['y']).buffer(v['outer_diameter']/2, quad_segs=64) for v in coincident])
                    output.append({'channel': ch['name'], 'polarity': leg['polarity'], 'kind': kind,
                        'ball': leg['ball'] if kind == 'BGA' else None,
                        'connectorContact': leg['connectorContact'] if kind == 'connector' else None,
                        'pad': pad, 'exactShapeAreaMm2': geom.area,
                        'nearestReferenceLayer': 'inner1' if pad.get('layer', 'top') == 'top' else 'inner4',
                        'projectedGroundOverlapMm2': overlap, 'projectedGroundFraction': overlap/geom.area,
                        'projectedParallelPlateCPf': EPS0*er*overlap*1e-6/(h*1e-3)*1e12,
                        'nearestReferenceBoundaryFromCenterMm': plane.boundary.distance(Point(pad['x'], pad['y'])),
                        'coincidentViaIds': [v['pcb_via_id'] for v in coincident],
                        'effectivePadAndCoincidentViaAreaMm2': effective.area,
                        'traceEntries': entries})
    return output


def network(z, ee, through_mm, stub_mm, f):
    """Differential odd-mode TL, reference 85 ohm, optional open pad remainder."""
    beta = 2*np.pi*f*math.sqrt(ee)/C0
    theta = beta*through_mm*1e-3
    a = np.zeros((len(f), 2, 2), complex)
    a[:, 0, 0] = a[:, 1, 1] = np.cos(theta)
    a[:, 0, 1], a[:, 1, 0] = 1j*z*np.sin(theta), 1j*np.sin(theta)/z
    b = np.zeros_like(a)
    b[:, 0, 0] = b[:, 1, 1] = 1
    b[:, 1, 0] = 1j*np.tan(beta*stub_mm*1e-3)/z
    a = a @ b
    aa, bb, cc, dd = a[:, 0, 0], a[:, 0, 1], a[:, 1, 0], a[:, 1, 1]
    den = aa+bb/85+cc*85+dd
    s21, s11 = 2/den, (aa+bb/85-cc*85-dd)/den
    return s21, s11


def metrics(z, ee, through, stub, frequency_ghz):
    f = np.linspace(.05, 16, 3191)*1e9
    s21, s11 = network(z, ee, through, stub, f)
    power_error = float(np.max(abs(abs(s21)**2+abs(s11)**2-1)))
    assert power_error < 1e-12
    i = int(np.argmin(abs(f-frequency_ghz*1e9)))
    return {'frequencyGHz': frequency_ghz, 'throughMm': through, 'openRemainderMm': stub,
        'insertionLossDB': float(-20*np.log10(abs(s21[i]))),
        'returnLossDB': float(-20*np.log10(max(abs(s11[i]), 1e-14))),
        'reflectedPowerFraction': float(abs(s11[i])**2),
        'maximumLosslessPowerBalanceError': power_error,
        'firstQuarterWaveOpenStubGHz': C0/(4*stub*1e-3*math.sqrt(ee))/1e9 if stub else None}


def finalize_case_scope(evidence):
    """Explicitly bind uniform sections to their full-plane pad examples."""
    inventory = evidence['padInventory']
    for row in evidence['distributedSections']:
        if row['name'] == 'nominal_masked_trace':
            row['applicability'] = 'Selected-stackup uniform trace with an unbroken ideal ground plane.'
            continue
        channel, kind = next((name, row['name'][len(name)+1:])
            for name in ['USB4_RX2', 'PCIE_TX3'] if row['name'].startswith(name+'_'))
        rows = [p for p in inventory if p['channel'] == channel and p['kind'] == kind]
        row['basisPads'] = [{'padId': p['pad']['pcb_smtpad_id'], 'polarity': p['polarity'],
            'connectorContact': p['connectorContact'], 'projectedGroundFraction': p['projectedGroundFraction']}
            for p in rows]
        row['applicability'] = 'Full-plane uniform exposed pad-pair proxy for '+channel+' '+kind+'. No finite ground aperture or 3D connector/package/solder field is modeled.'
        assert all(p['projectedGroundFraction'] > 1-1e-8 for p in rows)
    evidence['partialGroundConnectorPadsOutside2DCaseScope'] = [
        {'channel': p['channel'], 'polarity': p['polarity'], 'contact': p['connectorContact'],
         'projectedGroundFraction': p['projectedGroundFraction'],
         'padAreaOverApertureMm2': p['exactShapeAreaMm2']-p['projectedGroundOverlapMm2']}
        for p in inventory if p['kind'] == 'connector' and p['projectedGroundFraction'] < 1-1e-8]
    evidence['caseScopeCaveat'] = 'USB4_RX2 A11/A10 lands are fully projected over ground and define the USB4 2D example. TX2 B2/B3 and RX1 B11/B10 have partial ground apertures and are not represented by this full-plane section. Their mirrored aperture overlaps require finite return-path review; area alone proves no defect or tuning direction.'
    connector_file = ROOT/'dist/si-channel-review/launch-review/connectors.json'
    if connector_file.exists():
        companion = json.loads(connector_file.read_text())
        assert companion['sourceSha256'] == evidence['provenance']['sourceSha256']
        assert companion['handoffSha256'] == evidence['provenance']['handoffSha256']
        evidence['provenance']['connectorCompanionSha256'] = sha(connector_file)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-root', type=Path, default=ROOT/'dist/si-channel-review/launch-review')
    args = parser.parse_args()
    path = args.input_root.resolve()
    gfile, hfile, bfile = path/'geometry.json', path/'field-solver-handoff.json', path/'board.circuit.json'
    g, handoff, board = (json.loads(p.read_text()) for p in [gfile, hfile, bfile])
    stackfile = ROOT/'manufacturing/stackup/selected.json'
    assert g['sourceSha256'] == handoff['sourceSha256'] == sha(bfile)
    assert g['stackup'] == handoff['stackup'] == json.loads(stackfile.read_text())
    oldfile = ROOT/'dist/si-channel-review/selected-stackup-inputs/geometry.json'
    old = json.loads(oldfile.read_text())
    currentpads, oldpads = pads_by_channel(g), pads_by_channel(old)
    unchanged = {name: currentpads[name] == oldpads[name] for name in currentpads}
    assert all(unchanged.values()), 'Pad changes require fresh scope/review.'
    inventory = land_inventory(g, board)
    metal = g['stackup']['impedanceProfiles'][0]['calculatorGuideTraceModel']
    mask = g['stackup']['solderMaskModel']
    nominal = dict(height=g['stackup']['dielectrics'][0]['thicknessMm'],
        copper=metal['outerCopperThicknessMm'], top_width_reduction=metal['topWidthReductionFromBaseMm'],
        er=g['stackup']['dielectrics'][0]['designDk'], mask_er=mask['designDk'],
        mask_base=mask['aboveSubstrateMm'], mask_top=mask['aboveTraceMm'])
    focused = {c['name']: c for c in g['channels'] if c['name'] in ['PCIE_TX3', 'USB4_RX2']}
    recipes = [('nominal_masked_trace', .1234, .1001, 0., 8., True)]
    for name, ch in focused.items():
        p, n = ch['conductors']
        groups = [('connector', p['endPads'], n['endPads'])]
        groups += [(cp['kind'], cp.get('pads', cp.get('signalPads', [])), cn.get('pads', cn.get('signalPads', [])))
            for cp, cn in zip(p['components'], n['components'])]
        for kind, pp, nn in groups:
            for index, (a, b) in enumerate(zip(pp, nn)):
                if index:  # The second equal capacitor land has the same cross section.
                    continue
                assert a.get('ccw_rotation', 0) == b.get('ccw_rotation', 0) == 0
                pitch = abs(a['y']-b['y'])
                assert abs(a['x']-b['x']) < 1e-8
                assert abs(a['width']-b['width']) < 1e-8 and abs(a['height']-b['height']) < 1e-8
                recipes.append((name+'_'+kind, a['height'], pitch-a['height'], a['width'], ch['nyquistGHz'], False))
    sections, start = [], time.monotonic()
    for name, width, gap, length, freq, masked in recipes:
        solves = []
        for step in [.002, .001]:
            section = Section(**nominal, width=width, gap=gap, mask=masked, step=step, exterior=1.5)
            value = analyze(section)
            assert value['relative_residual'] < 1e-8
            solves.append(value)
        fine, coarse = solves[-1], solves[0]
        row = {'name': name, 'padLengthAlongXmm': length,
            'padTransverseWidthToNominalTraceRatio': width/.1234,
            'crossSectionSolves': solves,
            'meshRefinementZDifferenceOhm': fine['impedance_ohm']-coarse['impedance_ohm'],
            'electricalLengthDegreesAtNyquist': 360*freq*1e9*math.sqrt(fine['effective_er'])*length*1e-3/C0,
            'uniformSectionTotalDifferentialCapacitancePF': fine['capacitance_F_per_m']*length*1e-3*1e12,
            'uniformSectionTotalDifferentialInductanceNH': fine['inductance_H_per_m']*length*1e-3*1e9,
            'isolatedUniformPatch': metrics(fine['impedance_ohm'], fine['effective_er'], length, 0., freq)}
        if name.endswith('_connector'):
            row['hypotheticalContactSweep'] = [{'contactFractionFromTraceEntrySide': fraction,
                **metrics(fine['impedance_ohm'], fine['effective_er'], length*fraction, length*(1-fraction), freq)}
                for fraction in [0., .25, .5, .75, 1.]]
            row['interpretation'] = 'Unknown electrical contact position; length fractions are assumptions. PCIe enters along x; USB4 enters diagonally, so its uniform x-directed section is less representative.'
            if name.startswith('USB4'):
                row['manufacturer0p9mmLandCounterfactual'] = [{'contactFractionFromTraceEntrySide': fraction,
                    **metrics(fine['impedance_ohm'], fine['effective_er'], .9*fraction, .9*(1-fraction), freq)}
                    for fraction in [0., .25, .5, .75, 1.]]
        sections.append(row)
        print(json.dumps({'case': name, 'ZdiffOhm': fine['impedance_ohm'], 'elapsedSeconds': round(time.monotonic()-start, 2)}), flush=True)
    evidence = {'updatedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status': 'Focused PCB pad geometry and lossless distributed-section sensitivity; no board edits or native FDTD.',
        'provenance': {'sourceSha256': sha(bfile), 'geometrySha256': sha(gfile), 'handoffSha256': sha(hfile),
            'stackupSha256': sha(stackfile), 'sourceScriptSha256': sha(__file__),
            'crossSectionSolverSha256': sha(ROOT/'simulations/pcie-tx/cross_section.py'),
            'priorSelectedGeometrySha256': sha(oldfile), 'allTwelveChannelPadGeometriesUnchanged': unchanged,
            'sourceFiles': [str(p.relative_to(ROOT)) for p in [bfile, gfile, hfile, stackfile]]},
        'padInventory': inventory, 'distributedSections': sections,
        'numericChecks': {'allSelectedInputBindingsPassed': True,
            'allPriorAndCurrentPadDescriptorsExactlyEqual': all(unchanged.values()),
            'allElectrostaticRelativeResidualsBelow1eMinus8': all(v['relative_residual'] < 1e-8 for r in sections for v in r['crossSectionSolves']),
            'maximumTwoMeshImpedanceDifferenceOhm': max(abs(r['meshRefinementZDifferenceOhm']) for r in sections),
            'allLosslessNetworkPowerBalancesBelow1eMinus12': True},
        'formulasAndUnits': {'crossSection': 'Quasi-static odd differential excitation. Solve actual/vacuum C; Zdiff=1/(c*sqrt(C*C0)), epsilon_eff=C/C0. Copper thickness and top taper follow selected guide model. Lands are exposed; trace has selected mask.',
            'network': 'Lossless differential transmission-line ABCD with Zdiff in ohms and 85 ohm differential ports. beta=2*pi*f_Hz*sqrt(epsilon_eff)/c. Millimetres converted to metres once.',
            'openPadRemainder': 'Ystub=j*tan(beta*l_stub)/Zdiff. The contact position terminates the through section and attaches an open remainder. Unknown contact physics prevents treating any row as the actual launch.',
            'scenarioRange': 'Contact-sweep minima/maxima are only this assumed uniform-section family, not uncertainty bounds on the physical connector. No contact-aware 3D model or measured validation is present.',
            'lossScope': 'Reported insertion loss is reflection from a passive lossless mismatch, not dissipative copper/dielectric loss. Do not add it to previous lumped-pad full-channel loss: that double counts the pad and trace.',
            'shapeAccuracy': 'Circular and capsule pads use 64-segment quadrant buffers for plane-overlap area; rectangles are exact. This finite tessellation does not change the compared emitted pad descriptors.'},
        'findings': [
            {'name': 'No new mandatory pad or reference-plane change established', 'decision': 'Keep manufacturer PCIe land dimensions. The 2D finite patch identifies a reflection risk to verify with contact-aware 3D or measured connector data; it does not prove a faulty footprint.', 'mandatoryLayoutChange': False},
            {'name': 'Largest discontinuities', 'decision': 'Prioritize PCIe connector 0.7 mm transverse land and 0402 capacitor 0.54 mm transverse lands against 0.1234 mm trace. USB4 uses 0.270002 mm connector and 0.3240024 mm capacitor transverse lands.', 'mandatoryLayoutChange': False},
            {'name': 'Trace entry geometry', 'decision': 'PCIe lands are approached on the longitudinal centerline. USB4 RX2 ends have mirror diagonal entries. Capacitor and ESD routes pass through signal-pad centers; no separate authored signal tee stub is established from those entries.', 'mandatoryLayoutChange': False},
            {'name': 'Ground void decision', 'decision': 'No mandatory new void follows from total pad capacitance or a uniform pad section. Existing BGA antipads and via-in-pad copper invalidate an isolated uniform surface-pad model. A candidate void must preserve the return transition and be compared in a finite contact-aware 3D model.', 'mandatoryLayoutChange': False},
            {'name': 'Specific tuning candidates', 'decision': 'If contact-aware simulation confirms excessive reflection, compare an approved PCIe connector L2 antipad/local return shape and lower-ESL approved capacitor/land pattern. Keep mirrored trace entries and minimize exposed pad-to-trace transitions. Retain geometry until a measurable improvement is demonstrated.', 'mandatoryLayoutChange': False}],
        'manufacturerAndGuideContext': {'pcieLand': 'Connector agent verified manufacturer recommended 0.70 x 2.00 mm lands and 1.00 mm pitch; current copper matches. Contact position unavailable.',
            'usbCLand': 'Connector agent found A-row drawing 0.27 x 0.90 mm while emitted A-row is 0.27 x 1.00 mm. A 0.10 mm extension is a footprint tuning candidate, not a demonstrated electrical fault. B-row matches drawing.',
            'tiReference': 'https://www.ti.com/document-viewer/lit/html/SSZTAX3/GUID-2D2CAEAA-D7FA-43E3-8CAD-78D810632034',
            'tiInterpretation': 'TI recommends investigating significant trace-to-pad width discontinuities; reference voids are not universally required and need simulation.',
            'asmediaGuide': 'datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf',
            'budget': 'USB4 guide allows <38.1 mm SMT Type-C routing or <4 dB at 10 GHz. All USB4 paths meet the length alternative. No separate PCIe PCB-only dB limit is invented.'},
        'unavailable': ['Connector contact geometry, mating/card/cable response and measured multiport model',
            'PHY package/die interconnect, ball/lead inductance and package S-parameters',
            'Exact solder meniscus/contact current distribution for capacitor and ESD lands',
            'Construction-specific 8/10 GHz Df and copper roughness',
            'Finite 3D fringing, all nearby copper, mixed modes and mode conversion in these 2D sections'],
        'nativeLaunches': 0, 'completeLinkOrEyeBERComplianceClaim': False}
    finalize_case_scope(evidence)
    output = path/'launch-pads.json'
    temp = output.with_suffix('.json.tmp')
    temp.write_text(json.dumps(evidence, indent=2)+'\n')
    temp.replace(output)
    print(json.dumps({'output': str(output), 'sha256': sha(output), 'padRows': len(inventory)}), flush=True)


if __name__ == '__main__':
    main()
