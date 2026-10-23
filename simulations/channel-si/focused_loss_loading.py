"""Separate selected-stackup line loss from uncertain launch/component loading."""
from pathlib import Path
import ast
import copy
import datetime
import hashlib
import json
import math
import os
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FAST = ROOT / 'dist/si-channel-review/fast-screening'
INPUT = ROOT / 'dist/si-channel-review/selected-stackup-inputs'
OUT = ROOT / 'dist/si-channel-review/focused-risks'
MODEL = FAST / 'component_tline.py'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_model():
    """Load the existing validated model definitions, without its batch/output loop."""
    previous = json.loads((FAST / 'component-tline-results.json').read_text())
    assert sha(MODEL) == previous['inputSha256'][str(MODEL.relative_to(ROOT))]
    tree, body = ast.parse(MODEL.read_text()), []
    for statement in tree.body:
        if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'cases' for t in statement.targets):
            break
        if isinstance(statement, ast.Import) and any(n.name.startswith('matplotlib') for n in statement.names):
            continue
        if (isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call)
                and isinstance(statement.value.func, ast.Attribute)
                and isinstance(statement.value.func.value, ast.Name)
                and statement.value.func.value.id == 'matplotlib'):
            continue
        body.append(statement)
    namespace = {'__name__': 'focused_model_definitions', '__file__': str(MODEL)}
    saved_argv = sys.argv
    sys.argv = [str(MODEL), '--input-root', str(INPUT), '--output-root', str(OUT),
                '--nominal-section-file', str(ROOT / 'dist/slot-power-inner-copper-review/stackup-impedance.json'),
                '--neck-section-file', str(FAST / 'USB4-neck-cross-sections.json')]
    try:
        exec(compile(ast.Module(body=body, type_ignores=[]), str(MODEL), 'exec'), namespace)
    finally:
        sys.argv = saved_argv
    return namespace, previous


def conductor(m, channel, leg, geometry, **overrides):
    p = {'df': .02, 'roughness': 1.5, 'viaScale': 1., 'viaCpPF': .08,
         'vias': True, 'endpointPads': True, 'componentPads': True,
         'seriesCap': True, 'esd': True, 'pullDown': True, 'capLScale': 1.,
         'padScale': 1., 'componentPadScale': 1., 'endpointPadScale': 1.,
         'connectorPadScale': 1.,
         'esdCpPF': .15, 'esdLNH': .15, 'dielectricFill': 1., 'currentFactor': 1.}
    p.update(overrides)
    F, C0, pi = m['F'], m['C0'], np.pi
    identity, shunt, series, line = (m[k] for k in ['identity', 'shunt', 'series', 'line'])
    a = identity()
    if p['endpointPads']:
        a = a @ shunt(2j*pi*F*m['group_pad_c'](leg['startPads'])*p['padScale']*p['endpointPadScale'])
    via_index, alpha_d_total, alpha_c_total = 0, np.zeros(len(F)), np.zeros(len(F))
    for stage_index, stage in enumerate(leg['stages']):
        elements = []
        for index, point in enumerate(stage['route']):
            if point['route_type'] == 'via':
                elements.append(('via', point))
                continue
            if index + 1 == len(stage['route']):
                continue
            other = stage['route'][index + 1]
            if point['route_type'] == other['route_type'] == 'wire' and point['layer'] == other['layer']:
                length = np.hypot(point['x']-other['x'], point['y']-other['y'])
                if length > 1e-9:
                    elements.append(('wire', {'widthMm': point['width'], 'lengthMm': length}))
        for kind, element in elements:
            if kind == 'via':
                via = geometry['viaProxies'][via_index]
                via_index += 1
                if p['vias']:
                    admittance = 2j*pi*F*p['viaCpPF']*1e-12/2
                    a = a @ shunt(admittance) @ line(via['twoWireHomogeneousProxyZdiffOhm']*p['viaScale']/2, m['via_delay']) @ shunt(admittance)
                continue
            zd, ee = m['neck_cases']['isolated_3mil_line'] if element['widthMm'] < .1 else (m['normal_z'], m['normal_er'])
            length_m, width_m = element['lengthMm']/1000, element['widthMm']/1000
            surface_ohm = np.sqrt(pi*F*(4*pi*1e-7)*1.724e-8)
            alpha_d = pi*F*np.sqrt(ee)/C0*p['df']*length_m*p['dielectricFill']
            alpha_c = surface_ohm/(width_m*(zd/2))*length_m*p['roughness']*p['currentFactor']
            alpha_d_total += alpha_d
            alpha_c_total += alpha_c
            a = a @ line(zd/2, length_m*np.sqrt(ee)/C0, alpha_d+alpha_c)
        pad_scale = p['padScale']*p['componentPadScale'] if p['componentPads'] else 0.
        if channel['bus'] == 'USB4':
            if stage_index == 0:
                component = next(c for c in leg['components'] if c['kind'] == 'esd')
                admittance = 2j*pi*F*m['group_pad_c'](component['signalPads'])*pad_scale
                if p['esd']:
                    impedance = 2 + 2j*pi*F*p['esdLNH']*1e-9 + 1/(2j*pi*F*p['esdCpPF']*1e-12)
                    admittance += 1/impedance
                a = a @ shunt(admittance)
            elif stage_index == 1:
                component = next(c for c in leg['components'] if c['kind'] == 'series-capacitor')
                cp = m['group_pad_c'](component['pads'])*pad_scale/2
                impedance = (m['z_tx'] if channel['direction'] == 'TX' else m['rx_proxy']) + 2j*pi*F*m['murata_lnh']*1e-9*(p['capLScale']-1)
                a = a @ shunt(2j*pi*F*cp) @ (series(impedance) if p['seriesCap'] else identity()) @ shunt(2j*pi*F*cp)
            elif stage_index == 2:
                component = next(c for c in leg['components'] if c['kind'] == 'shunt-resistor')
                admittance = 2j*pi*F*m['group_pad_c'](component['signalPads'])*pad_scale
                if p['pullDown']:
                    admittance += 1/220000 + 2j*pi*F*.02e-12
                a = a @ shunt(admittance)
        elif channel['direction'] == 'TX' and stage_index == 0:
            component = leg['components'][0]
            cp = m['group_pad_c'](component['pads'])*pad_scale/2
            impedance = m['z_pcie'] + 2j*pi*F*m['samsung_l']*(p['capLScale']-1)
            a = a @ shunt(2j*pi*F*cp) @ (series(impedance) if p['seriesCap'] else identity()) @ shunt(2j*pi*F*cp)
    if p['endpointPads']:
        a = a @ shunt(2j*pi*F*m['group_pad_c'](leg['endPads'])*p['padScale']*p['endpointPadScale']*p['connectorPadScale'])
    return m['s_matrix'](a), alpha_d_total, alpha_c_total


def evaluate(m, channel, geometry, **parameters):
    positive, adp, acp = conductor(m, channel, channel['conductors'][0], geometry, **parameters)
    negative, adn, acn = conductor(m, channel, channel['conductors'][1], geometry, **parameters)
    scattering = (positive + negative)/2
    frequency = channel['nyquistGHz']*1e9
    at = lambda values: float(np.interp(frequency, m['F'], values))
    result = {'insertionLossDB': at(-m['db'](scattering[:,1,0])),
              'returnLossDB': at(-m['db'](scattering[:,0,0])),
              'uniformDielectricAttenuationDB': at(20/np.log(10)*(adp+adn)/2),
              'uniformConductorAttenuationDB': at(20/np.log(10)*(acp+acn)/2),
              'transmittedPowerFraction': at(abs(scattering[:,1,0])**2),
              'reflectedPowerFraction': at(abs(scattering[:,0,0])**2),
              'parameters': parameters}
    return result, scattering


def pad_groups(m, channel):
    groups = []
    for leg in channel['conductors']:
        rows = [('startPads', leg['startPads']), ('endPads', leg['endPads'])]
        rows += [(c['kind'], c.get('pads', c.get('signalPads', []))) for c in leg['components']]
        for kind, pads in rows:
            groups.append({'leg': leg['polarity'], 'kind': kind,
                          'parallelPlateCapacitancePF': m['group_pad_c'](pads)*1e12,
                          'pads': [{k:v for k,v in p.items() if k in ['pcb_port_id', 'x', 'y', 'width', 'height', 'radius', 'diameter', 'shape', 'layer']}
                                   | {'capacitancePF': m['pad_c'](p)*1e12} for p in pads]})
    return groups


def main():
    m, previous = load_model()
    results, numerical_checks = [], []
    for name in ['PCIE_TX3', 'USB4_RX2']:
        channel = next(c for c in m['g']['channels'] if c['name'] == name)
        geometry = next(g for g in m['geometry'] if g['name'] == name)
        full, full_scattering = evaluate(m, channel, geometry)
        original = sum(m['conductor'](channel, leg, geometry, .02, 1.5, 'isolated_3mil_line', 1., 1., .08)[0]
                       for leg in channel['conductors'])/2
        reproduction_error = float(np.max(abs(original-full_scattering)))
        assert reproduction_error < 1e-12
        numerical_checks.append({'name': name+' original full-band complex model reproduction', 'maximumComplexError': reproduction_error, 'passed': True})
        off = {'vias': False, 'endpointPads': False, 'componentPads': False, 'seriesCap': False, 'esd': False, 'pullDown': False}
        rows = []
        steps = [('routed_uniform_lines_only', {}), ('plus_vias', {'vias': True}),
                 ('plus_endpoint_pads', {'endpointPads': True}), ('plus_component_pads', {'componentPads': True}),
                 ('plus_series_capacitor', {'seriesCap': True}), ('plus_ESD_device', {'esd': True}),
                 ('plus_pull_down', {'pullDown': True})]
        cumulative = dict(off)
        last = None
        for label, update in steps:
            cumulative.update(update)
            value, _ = evaluate(m, channel, geometry, **cumulative)
            rows.append({'name': label, **value, 'incrementFromPreviousDB': None if last is None else value['insertionLossDB']-last})
            last = value['insertionLossDB']
        sweeps = {}
        for key, values in {'df': [0., .012, .015, .02, .03], 'roughness': [1., 1.5, 2.],
                            'viaScale': [.8, 1., 1.2], 'viaCpPF': [.02, .08, .20],
                            'padScale': [.5, 1., 2.], 'componentPadScale': [.5, 1., 2.],
                            'endpointPadScale': [.5, 1., 2.], 'capLScale': [.5, 1., 1.5]}.items():
            sweeps[key] = [{'value': v, **evaluate(m, channel, geometry, **{key:v})[0]} for v in values]
        sweeps['connectorPadScale'] = [{'value': v, **evaluate(m, channel, geometry, connectorPadScale=v)[0]} for v in [0., .5, 1., 2.]]
        if channel['bus'] == 'USB4':
            sweeps['esdCpPF'] = [{'value': v, **evaluate(m, channel, geometry, esdCpPF=v)[0]} for v in [.10, .15, .30]]
        ee, er, zodd = m['normal_er'], m['er'], m['normal_z']/2
        fill = er/(er-1)*(ee-1)/ee
        current = np.exp(-1.2*(zodd/376.730313668)**.7)
        alternatives = {'bulk_Df_as_effective_tan_delta_and_Ki_1': full,
                        'microstrip_dielectric_fill_only': evaluate(m, channel, geometry, dielectricFill=fill)[0],
                        'Hammerstad_current_factor_only': evaluate(m, channel, geometry, currentFactor=float(current))[0],
                        'both_single_microstrip_formula_alternatives': evaluate(m, channel, geometry, dielectricFill=fill, currentFactor=float(current))[0]}
        removals = {key: evaluate(m, channel, geometry, **{key:False})[0] for key in off}
        uniform_only = rows[0]
        passive = float(np.max(np.linalg.svd(full_scattering, compute_uv=False)))
        assert passive <= 1.00001
        numerical_checks.append({'name': name+' reduced network passivity', 'maximumSingularValue': passive, 'passed': True})
        results.append({'channel': name, 'frequencyGHz': channel['nyquistGHz'], 'lengthsMm': geometry['lengthsMm'],
                        'fullMiddleScenario': full, 'orderedDecomposition': rows,
                        'decompositionWarning': 'Ordered counterfactual insertion-loss changes include mismatch/interference. They are not additive dissipative component losses.',
                        'oneParameterAtATime': sweeps, 'oneBlockRemovedFromFull': removals,
                        'formulaAlternatives': alternatives, 'dielectricFillFactor': float(fill), 'currentDistributionFactor': float(current),
                        'uniformLossDBPerMm': uniform_only['insertionLossDB']/np.mean(geometry['lengthsMm']),
                        'conditionalUniformLossReductionFor10MmShorterDB': 10*uniform_only['insertionLossDB']/np.mean(geometry['lengthsMm']),
                        'padLoadingByGroup': pad_groups(m, channel), 'viaProxyEvidence': geometry['viaProxies'],
                        'connectorPadInterpretation': {'approximatePadDimensionsMm': [2., .7] if name=='PCIE_TX3' else [1., .270],
                            'totalProjectedPadCPfPerLeg': m['group_pad_c'](channel['conductors'][0]['endPads'])*1e12,
                            'unknowns': ['Actual contact location and reference plane', 'Distributed launch impedance rather than a point shunt',
                                         'Fringing, etched geometry, pad/trace overlap and connector fields'],
                            'scaleMeaning': 'Connector-pad scales change only the lumped end-pad proxy, not BGA lands or component pads. Zero is a diagnostic removal, not a manufacturable zero-capacitance launch.',
                            'padCapacitanceModelScope': 'Total projected pad capacitance, not calibrated excess capacitance above its through-line. Fringing, overlapping trace capacitance and distributed contact location are unresolved.',
                            'groundVoidMandated': False},
                        'guide': {'source': 'datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf',
                                  'page': 3 if channel['bus']=='USB4' else 5,
                                  'maximumRouteLengthMm': 38.1 if channel['bus']=='USB4' else 127.,
                                  'planarLengthAlternativeMet': max(geometry['lengthsMm']) < (38.1 if channel['bus']=='USB4' else 127.),
                                  'pcbInsertionLossLimitDB': 4. if channel['bus']=='USB4' else None,
                                  'lossLimitFrequencyGHz': 10 if channel['bus']=='USB4' else None,
                                  'preferredUSB4LengthRangeMm': [12.7,30.48] if channel['bus']=='USB4' else None,
                                  'project20mmTargetIsASMediaLimit': False,
                                  'scope': 'USB4 guide allows short SMT-Type-C routing or insertion loss below 4 dB at 10 GHz. PCIe connector routing has length/via guidance, with no standalone PCB dB limit in this guide.'}})
    evidence = {'createdUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status': 'Focused reduced-model sensitivity; no physical board change or native FDTD campaign.',
        'sourceSha256': previous['sourceSha256'], 'handoffSha256': previous['handoffSha256'], 'stackupSha256': previous['stackupSha256'],
        'channels': results, 'numericChecks': m['checks'] + numerical_checks,
        'formulaAndUnitAudit': {'frequency': 'Hz in all equations. mm converted to metres once for length/width/area. pF→1e-12F; nH→1e-9H.',
            'delay': 'tau=L_m*sqrt(epsilon_eff)/c0, seconds.',
            'skinResistance': 'Rs=sqrt(pi*f_Hz*mu0*rho), ohms per square; rho=1.724e-8 ohm*m.',
            'originalConductorAttenuation': 'alpha_c*L=Rs*L/(w_m*Zodd)*roughness, nepers. Current distribution factor was implicitly1.',
            'originalDielectricAttenuation': 'alpha_d*L=pi*f*sqrt(epsilon_eff)*Df*L/c0, nepers. This treats the chosen bulk Df as effective modal tan(delta).',
            'microstripAlternatives': 'q=epsilon_r/(epsilon_r-1)*(epsilon_eff-1)/epsilon_eff; Ki=exp(-1.2*(Zodd/376.7303)^0.7). These single-microstrip estimates are sensitivity alternatives for a masked coupled pair, not validated corrections.',
            'nepersToDB': '20/ln(10)=8.685889638. Positive IL=-20log10|S21|; positive RL=-20log10|S11|.',
            'differentialReference': 'Each independent leg uses Zodd=Zdiff/2 and a 42.5 ohm port reference. Averaging leg transfer yields the stated 85 ohm differential surrogate. Do not double its dB loss.',
            'parallelPlatePad': 'C=epsilon0*epsilon_r*A_m2/h_m per leg, projected over actual nearby ground-plane union; excludes fringing and distributed pad behavior.',
            'limit': 'Independent-leg averaging does not solve physical mixed-mode coupling, crosstalk, package, connector or die-loading.'},
        'laminateEvidence': {'selectedFamily': 'Nan Ya NP-155F; exact variant and foil remain unassigned.',
            'localResearch': 'manufacturing/stackup/laminate-research.json',
            'manufacturerDatasheet': 'datasheets/laminates/nan-ya-np-155f-jlcpcb.pdf',
            'primarySupplierURL': 'https://rs.jlcpcb.com/static/file/nan-ya-np-155f-datasheet.pdf',
            'typicalDfAt1GHz': {'NP-155FR': [.014,.016], 'NP-155FTL': [.012,.014]},
            'verifiedDfAt8Or10GHz': None, 'verifiedFoilRoughness': None,
            'webCheck': 'Primary supplier PDF confirms only 1 MHz/1 GHz values. No construction-specific 8/10 GHz Df was found. The newer manufacturer-host PDF timed out and supplies no numeric evidence here.',
            'interpretation': 'Do not treat 1 GHz typical Df as a guaranteed 10 GHz value or treat assumed Df/roughness scenarios as measured bounds.'},
        'componentEvidence': {'murata': m['cap_fit'], 'samsung': m['samsung_fit'],
            'ESD': '0.15 pF plus assumed 0.15 nH/2 ohm surrogate. No package/PCB mounting S-parameters. The exact 330 nF RX capacitor uses a 220 nF package proxy.',
            'frequencyCoverage': 'Both manufacturer capacitor models stop at 6 GHz. Values at 8/10 GHz are extrapolations.'},
        'decisions': {'mandatoryLayoutChangesFromLossAlone': [],
            'PCIe_TX3': 'No demonstrated loss-rule violation: the ASMedia guide supplies no PCB-only 8 GHz dB limit. The 57.74 mm route meets its 127 mm connector length guidance. Loss remains material/model dependent.',
            'USB4_RX2': 'The 14.76 mm route meets the 38.1 mm short-route alternative and lies in its preferred 12.7-30.48 mm range. The 20 mm value is a project target. The nominal surrogate gives 2.12 dB at 10 GHz. A 0.19 dB change in one assumed worst scenario does not mandate rerouting. Uncertain loading/materials still prevent link clearance.',
            'feasibleChangesForTargetedEvaluation': [
                'If routing review finds removable PCIe TX3 detours, shorten them without changing 85 ohm geometry. Conditional dB/mm sensitivity is reported, not a claim that 10 mm can be removed.',
                'Evaluate a vendor-approved 0201 PCIe TX coupling capacitor and its pads versus the current 0402 as a joint network. Preserve 220 nF and verify 8 GHz mounted S-parameters before a footprint change.',
                'Model the actual capacitor/ESD/connector-pad launches before changing them. The largest projected pad-C terms can be mandatory connector/BGA lands, not safely shrinkable excess copper.',
                'Do not remove ESD protection or cut the reference plane merely because a lumped loading proxy improves. Such changes can worsen return paths and require separate evidence.'],
            'padOptimizationCaution': 'Smaller component pads are not automatically better: halving only PCIe TX3 component-pad C raises modeled IL from 6.247 to 6.652 dB. Its capacitance partly compensates inductive loading. A distributed connector-pad discontinuity warrants a targeted launch/void study, but unknown contact/return geometry prevents a mandatory void recommendation.',
            'nextEvidence': 'Exact pressed 3313/prepreg Df at 8/10 GHz, foil roughness/coupon loss, and mounted capacitor/ESD/connector models resolve the largest uncertainty before loss-driven rerouting.'},
        'sources': {'formulaPrimaryURL': 'https://qucs.sourceforge.net/tech/node75.html',
                    'formulaSections': ['11.79 dielectric loss','11.80-11.83 conductor/current-distribution/roughness'],
                    'padLaunchPrimaryURL': 'https://www.ti.com/document-viewer/lit/html/SSZTAX3/GUID-2D2CAEAA-D7FA-43E3-8CAD-78D810632034',
                    'padLaunchInterpretation': 'TI recommends investigating large trace-to-pad discontinuities. It explicitly notes that reference-plane voids are not always required and calls for simulation.',
                    'guideVisualReviewPages': [3,5]},
        'inputSha256': {**previous['inputSha256'], 'focusedScript': sha(Path(__file__)),
                       'ASMediaGuide': sha(ROOT/'datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf'),
                       'NanyaDatasheet': sha(ROOT/'datasheets/laminates/nan-ya-np-155f-jlcpcb.pdf')},
        'fullChannelVerified': False, 'eyeOrBERComputed': False, 'physicalBoardModified': False, 'nativeFDTDRunsLaunched': 0}
    OUT.mkdir(exist_ok=True)
    temporary = OUT/'loss-loading.json.tmp'
    temporary.write_text(json.dumps(evidence, indent=2)+'\n')
    os.replace(temporary, OUT/'loss-loading.json')
    print(json.dumps({'output': str(OUT/'loss-loading.json'), 'channels': [{
        'name': c['channel'], 'fullDB': c['fullMiddleScenario']['insertionLossDB'],
        'uniformDB': c['orderedDecomposition'][0]['insertionLossDB'],
        'stages': [(r['name'], r['insertionLossDB']) for r in c['orderedDecomposition']],
        'pads': [(p['leg'],p['kind'],p['parallelPlateCapacitancePF']) for p in c['padLoadingByGroup']]
        } for c in results]}), flush=True)


if __name__ == '__main__':
    main()
