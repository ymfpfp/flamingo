"""Finite selected-stackup neck sensitivity and clearance-preserving alternatives.

This is a lossless quasi-TEM line/geometry screen, not native 3D extraction.
"""
from pathlib import Path
from dataclasses import asdict
import argparse, datetime, hashlib, json, math, sys
import numpy as np
from shapely.geometry import LineString, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from cross_section import Section, analyze
from copper_geometry import copper_objects

C0 = 299792458.
F = np.linspace(1e9, 12e9, 1101)
WIDTH, NECK, CLEARANCE = .1234, .0762, .100
TARGETS = ['USB4_TX2', 'USB4_RX1', 'PCIE_RX3']
TI_URL = 'https://www.ti.com/document-viewer/lit/html/SSZTAX3/GUID-2D2CAEAA-D7FA-43E3-8CAD-78D810632034'

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def load(path):
    return json.loads(Path(path).read_text())

def xy(point):
    return np.array([point['x'], point['y']])

def segments(conductor):
    return [segment for stage in conductor['stages'] for segment in stage['segments']]

def line_shape(segment, width=None):
    return LineString([xy(segment['from']), xy(segment['to'])]).buffer(
        (width or segment['widthMm']) / 2, quad_segs=32)

def neck_length(conductor):
    return sum(s['lengthMm'] for s in segments(conductor) if s['widthMm'] < .1)

def proposed_segments(conductor, retained_neck):
    """Keep the initial retained_neck mm narrow; preserve every centerline."""
    out, travelled = [], 0.
    for segment in segments(conductor):
        length = segment['lengthMm']
        assert length > 0
        if segment['widthMm'] >= .1 or travelled >= retained_neck:
            out.append({**segment, 'widthMm': WIDTH})
        elif travelled + length <= retained_neck:
            out.append(segment)
        else:
            fraction = (retained_neck - travelled) / length
            middle = xy(segment['from']) + fraction * (xy(segment['to']) - xy(segment['from']))
            point = {'x': float(middle[0]), 'y': float(middle[1])}
            out.extend([{**segment, 'to': point, 'lengthMm': length * fraction},
                        {**segment, 'from': point, 'lengthMm': length * (1-fraction), 'widthMm': WIDTH}])
        travelled += length
    return out

def clearance_check(channel, objects, retained):
    proposed = [proposed_segments(q, length) for q, length in zip(channel['conductors'], retained)]
    rows = []
    for index, conductor in enumerate(channel['conductors']):
        own_traces = {s['traceId'] for s in conductor['stages']}
        mate = channel['conductors'][1-index]
        mate_traces = {s['traceId'] for s in mate['stages']}
        own_ports = {conductor['start']['pcb_port_id'], conductor['end']['pcb_port_id']}
        neck_limit = neck_length(conductor)
        shapes, offset = [], 0.
        for segment in proposed[index]:
            if offset < neck_limit - 1e-9:
                shapes.append(line_shape(segment))
            offset += segment['lengthMm']
        region = unary_union(shapes)
        nearby = region.buffer(.3)
        obstacles = [o for o in objects if 'top' in o['layers'] and o['trace'] not in own_traces | mate_traces
                     and o['port'] not in own_ports and o['shape'].intersects(nearby)]
        obstacles += [{'shape': line_shape(s), 'label': f"mate_{mate['polarity']}_trace"}
                      for s in proposed[1-index] if s['layer'] == 'top' and line_shape(s).intersects(nearby)]
        closest = min(obstacles, key=lambda item: region.distance(item['shape']))
        gap = float(region.distance(closest['shape']))
        rows.append({'polarity': conductor['polarity'], 'minimumForeignCopperGapMm': gap,
                     'closestObject': closest['label'], 'requiredGapMm': CLEARANCE,
                     'passesGeometricClearance': gap >= CLEARANCE - 1e-8})
    return {'passed': all(row['passesGeometricClearance'] for row in rows), 'conductors': rows,
            'scope': 'Top copper polygon spacing in the neck region, including the proposed mate width. No board mutation, complete DRC, solder-mask or manufacturing acceptance.'}

def symmetric_shortening(channel, objects):
    length = max(neck_length(q) for q in channel['conductors'])
    low, high = 0., length
    for _ in range(25):
        middle = (low + high) / 2
        candidate = clearance_check(channel, objects, [middle, middle])
        if all(row['minimumForeignCopperGapMm'] >= CLEARANCE + .001 for row in candidate['conductors']):
            high = middle
        else:
            low = middle
    return min(length, high + .005)

def identity():
    return np.broadcast_to(np.eye(2), (len(F), 2, 2)).copy().astype(complex)

def line(z, er, length_mm):
    phase = 2*np.pi*F*length_mm*.001*np.sqrt(er)/C0
    out = identity()
    out[:, 0, 0] = out[:, 1, 1] = np.cos(phase)
    out[:, 0, 1] = 1j*z*np.sin(phase)
    out[:, 1, 0] = 1j*np.sin(phase)/z
    return out

def scattering(abcd, zref):
    a,b,c,d = abcd[:,0,0],abcd[:,0,1],abcd[:,1,0],abcd[:,1,1]
    denominator = a+b/zref+c*zref+d
    return (a+b/zref-c*zref-d)/denominator, 2/denominator

def db(value):
    return 20*np.log10(np.maximum(abs(value), 1e-15))

def finite(channel, retained, section_neck, section_wide, trunk):
    reflections, transmissions, propagation = [], [], []
    zref = trunk['impedance_ohm']/2
    window = max(neck_length(q) for q in channel['conductors'])
    for conductor, neck_kept in zip(channel['conductors'], retained):
        # Both legs use the same launch-window length and coupling scenario.
        # Otherwise the shorter original neck would incorrectly turn its
        # remaining launch copper into perfectly coupled trunk material.
        neck_kept = min(neck_kept, window)
        converted = window-neck_kept
        normal_length = conductor['lengthMm']-window
        abcd = (line(section_neck['impedance_ohm']/2, section_neck['effective_er'], neck_kept)
                @line(section_wide['impedance_ohm']/2, section_wide['effective_er'], converted)
                @line(zref, trunk['effective_er'], normal_length))
        reflection, transmission = scattering(abcd, zref)
        reflections.append(reflection);transmissions.append(transmission)
        propagation.append((neck_kept*np.sqrt(section_neck['effective_er'])
                            +converted*np.sqrt(section_wide['effective_er'])
                            +normal_length*np.sqrt(trunk['effective_er']))*.001/C0)
        assert np.max(abs(abs(reflection)**2+abs(transmission)**2-1)) < 1e-10
    r = (reflections[0]+reflections[1])/2
    t = (transmissions[0]+transmissions[1])/2
    group = [-np.gradient(np.unwrap(np.angle(value)), 2*np.pi*F) for value in transmissions]
    frequency = channel['nyquistGHz']*1e9
    k = int(np.argmin(abs(F-frequency)))
    phase_skew = np.unwrap(np.angle(transmissions[0]/transmissions[1]))/(2*np.pi*F)
    return {'retainedNeckLengthsMm': list(retained), 'commonLaunchWindowMm': window, 'frequencyGHz': channel['nyquistGHz'],
            'differentialReferenceOhms': trunk['impedance_ohm'],
            'losslessMismatchInsertionLossAtNyquistDB': float(-db(t[k])),
            'differentialReflectionAmplitudeAtNyquist': float(abs(r[k])),
            'returnLossAtNyquistDB': float(-db(r[k])),
            'maximumReflectionAmplitudeThrough12GHz': float(abs(r).max()),
            'minimumReturnLoss1Through12GHzDB': float((-db(r)).min()),
            'propagationDelayPS': [float(value*1e12) for value in propagation],
            'propagationSkewPS': float(abs(propagation[0]-propagation[1])*1e12),
            'phaseDelaySkewAtNyquistPS': float(abs(phase_skew[k])*1e12),
            'groupDelaySkewAtNyquistPS': float(abs(group[0][k]-group[1][k])*1e12),
            'maximumPhaseDelaySkew1Through12GHzPS': float(abs(phase_skew).max()*1e12),
            'scope': 'Lossless finite-width line sensitivity between ideal nominal-trunk ports. The reported differential response averages independent odd-mode leg surrogates. Bends, pads, vias, package, common-mode impedance and mutual coupling variation are not extracted.',
            'complianceLimitApplied': False, 'qualified': False}

def recheck_current(result, current_board, current_handoff):
    board = load(current_board)
    board = board.get('circuitJson', board) if isinstance(board, dict) else board
    handoff = load(current_handoff)
    assert handoff['sourceSha256'] == sha(current_board)
    assert handoff['stackup'] == load(Path(result['inputRoot'])/'selected.json')
    objects = copper_objects(board)
    cases = []
    for previous in result['channels']:
        channel = next(c for c in handoff['channels'] if c['name'] == previous['name'])
        necks = {q['polarity']: [s for s in segments(q) if s['widthMm'] < .1] for q in channel['conductors']}
        identical = necks == previous['actualNeckSegments']
        assert identical, ('Current neck geometry changed; recompute finite sections', previous['name'])
        cases.append({'name': previous['name'], 'neckGeometryIdentical': identical,
                      'baselineClearance': clearance_check(channel, objects, [neck_length(q) for q in channel['conductors']]),
                      'proposedClearance': clearance_check(channel, objects, previous['recommendation']['retainedNeckLengthsMm'])})
    result['currentBoardLocalRecheck'] = {
        'checkedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sourceFile': str(current_board), 'sourceSha256': sha(current_board),
        'handoffFile': str(current_handoff), 'handoffSha256': sha(current_handoff),
        'stackupUnchanged': True, 'cases': cases,
        'scope': 'Fresh-board neck geometry equality and local foreign-copper clearance only. Static cross-sections are unchanged; no whole-path electromagnetic result is promoted to the fresh board.'}
    result['inputSha256'].update({str(path): sha(path) for path in [current_board,current_handoff,Path(__file__)]})

def main(args):
    root, out = args.input_root.resolve(), args.output_root.resolve()
    out.mkdir(parents=True, exist_ok=True)
    handoff = load(root/'field-solver-handoff.json')
    stack = load(root/'selected.json')
    assert handoff['sourceSha256'] == sha(root/'board.circuit.json')
    assert handoff['stackup'] == stack and stack['dielectrics'][0]['thicknessMm'] == .092
    raw = load(root/'board.circuit.json')
    board = raw.get('circuitJson', raw) if isinstance(raw, dict) else raw
    objects = copper_objects(board)
    cache = load(ROOT/'dist/slot-power-inner-copper-review/stackup-impedance.json')
    assert cache['stackupSha256'] == sha(root/'selected.json')
    trunk = cache['surfacePair'][-1]
    cross_sections = {}
    def section(width, pitch=None):
        key = f'{width:g}-' + ('isolated' if pitch is None else f'pitch-{pitch:g}')
        if key not in cross_sections:
            cases = []
            for step in [.002, .001]:
                spec = Section(width=width, gap=(.1001 if pitch is None else pitch-width),
                               height=.092, single=pitch is None, exterior=4.8 if pitch is None else 1.2, step=step)
                result = analyze(spec)
                if spec.single:result['impedance_ohm'] *= 2
                result['impedanceConvention'] = 'Differential equivalent, twice single-ended when isolated'
                cases.append(result)
            cross_sections[key] = {'cases': cases, 'lastMeshChangeOhms': abs(cases[1]['impedance_ohm']-cases[0]['impedance_ohm']),
                                   'scope': 'Two cheap quasi-static meshes of a uniform trapezoid, not finite launch extraction.'}
            print(json.dumps({'crossSection': key, 'ohms': cases[-1]['impedance_ohm'], 'meshDeltaOhms': cross_sections[key]['lastMeshChangeOhms']}), flush=True)
        return cross_sections[key]['cases'][-1]
    results = []
    for channel in handoff['channels']:
        if channel['name'] not in TARGETS:
            continue
        conductors = channel['conductors']
        lengths = [neck_length(q) for q in conductors]
        necks = [[s for s in segments(q) if s['widthMm'] < .1] for q in conductors]
        center_pitch = min(LineString([xy(s['from']),xy(s['to'])]).distance(LineString([xy(m['from']),xy(m['to'])]))
                           for s in necks[0] for m in segments(conductors[1]) if m['layer'] == 'top')
        baseline_clearance = clearance_check(channel, objects, lengths)
        all_wide_clearance = clearance_check(channel, objects, [0.,0.])
        if channel['name'] == 'PCIE_RX3':
            recommended_lengths = [min(lengths),min(lengths)]
            proposal_name = 'Shorten longer N neck by widening its final 0.370300 mm; keep P neck and both centerlines unchanged.'
        else:
            matched = symmetric_shortening(channel, objects)
            recommended_lengths = [matched,matched]
            proposal_name = 'Optional symmetric shortening: widen both neck suffixes only after the common clearance-safe arclength.'
        recommendation_clearance = clearance_check(channel, objects, recommended_lengths)
        alternatives = []
        for assumption, pitch in [('closest-spacing-throughout',center_pitch),('isolated-throughout',None)]:
            narrow, wide = section(NECK,pitch), section(WIDTH,pitch)
            before = finite(channel,lengths,narrow,wide,trunk)
            proposed = finite(channel,recommended_lengths,narrow,wide,trunk)
            all_wide = finite(channel,[0.,0.],narrow,wide,trunk)
            alternatives.append({'couplingAssumption': assumption,
                                 'neckUniformEquivalentOhms': narrow['impedance_ohm'],
                                 'wideUniformEquivalentOhms': wide['impedance_ohm'],
                                 'actualFiniteSections': before, 'recommendedFiniteSections': proposed,
                                 'allWideHypotheticalInfeasible': all_wide,
                                 'recommendedMismatchLossImprovementAtNyquistDB': before['losslessMismatchInsertionLossAtNyquistDB']-proposed['losslessMismatchInsertionLossAtNyquistDB'],
                                 'recommendedReflectionAmplitudeReductionAtNyquist': before['differentialReflectionAmplitudeAtNyquist']-proposed['differentialReflectionAmplitudeAtNyquist'],
                                 'recommendedPropagationSkewReductionPS': before['propagationSkewPS']-proposed['propagationSkewPS']})
        change_points = []
        for q, kept in zip(conductors,recommended_lengths):
            offset = 0.
            for segment in segments(q):
                if offset <= kept <= offset+segment['lengthMm']:
                    fraction = (kept-offset)/segment['lengthMm']
                    point = xy(segment['from'])+fraction*(xy(segment['to'])-xy(segment['from']))
                    change_points.append({'polarity':q['polarity'],'retainedNeckMm':kept,
                                          'startFullWidthAt':{'x':float(point[0]),'y':float(point[1]),'layer':segment['layer']}})
                    break
                offset += segment['lengthMm']
        results.append({'name':channel['name'],'nyquistGHz':channel['nyquistGHz'],
                        'actualNeckLengthsMm':lengths,'neckLengthDifferenceMm':abs(lengths[0]-lengths[1]),
                        'actualNeckSegments':{q['polarity']:rows for q,rows in zip(conductors,necks)},
                        'minimumMateCenterlineDistanceMm':center_pitch,
                        'minimumSymmetricNarrowEdgeGapMm':center_pitch-NECK,
                        'totalPlanarLengthsMm':[q['lengthMm'] for q in conductors],
                        'baselineClearance':baseline_clearance,'blindFullWideningClearance':all_wide_clearance,
                        'finiteSensitivity':alternatives,
                        'recommendation':{'description':proposal_name,'retainedNeckLengthsMm':recommended_lengths,
                                          'widthMmAfterTransition':WIDTH,'changePoints':change_points,
                                          'clearance':recommendation_clearance,
                                          'symmetryGuidelineDeviation':abs(lengths[0]-lengths[1])>1e-9,
                                          'needsChangeToMeetEqualNeckLengthGuidance':abs(lengths[0]-lengths[1])>1e-9,
                                          'demonstratedComplianceFailure':False,
                                          'priority':'recommended low-cost layout correction' if channel['name']=='PCIE_RX3' else 'optional improvement; no forced reroute demonstrated',
                                          'approvalBasis':'Finite surrogate impact and primary symmetric-necking guidance; not an invented channel mask.',
                                          'requiresBeforeImplementation':'Native PCB DRC and BGA clearance/transition review on a candidate layout. No copper is changed by this analysis.'}})
    checks = []
    matched = line(42.5,3.,2.)
    r,t = scattering(matched,42.5)
    expected = np.exp(-2j*np.pi*F*.002*np.sqrt(3.)/C0)
    checks.append({'name':'Matched line phase and zero reflection','passed':bool(abs(r).max()<1e-12 and abs(t-expected).max()<1e-12)})
    checks.append({'name':'All uniform cross-section linear solve residuals','passed':all(case['relative_residual']<1e-8 for row in cross_sections.values() for case in row['cases'])})
    assert all(check['passed'] for check in checks)
    files=[root/'board.circuit.json',root/'field-solver-handoff.json',root/'selected.json',
           ROOT/'simulations/pcie-tx/cross_section.py',ROOT/'simulations/pcie-tx/copper_geometry.py',
           ROOT/'jlcpcb-clearance-rules.json',ROOT/'lib/high-speed-rules.ts',
           ROOT/'datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf',
           ROOT/'dist/slot-power-inner-copper-review/stackup-impedance.json',Path(__file__)]
    result={'createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputRoot':str(root),
            'sourceSha256':sha(root/'board.circuit.json'),'handoffSha256':sha(root/'field-solver-handoff.json'),
            'stackupSha256':sha(root/'selected.json'),'stackupCode':stack['code'],
            'scope':'Finite neck-only lossless line/reflection/delay sensitivity and local copper-clearance alternatives. Frozen selected snapshot, no physical layout changes or native 3D solves.',
            'fullChannelVerified':False,'complianceVerified':False,'native3DSolvesLaunched':0,
            'channels':results,'crossSections':cross_sections,'numericChecks':checks,
            'applicability':[{'name':c['name'],'containsNarrowDataNeck':any(neck_length(q)>0 for q in c['conductors'])} for c in handoff['channels']],
            'primaryGuidance':[{'source':TI_URL,'title':'TI SSZTAX3, Eye Doctor: Reflections and How to Deal with Them in High-speed Systems','interpretation':'Neck symmetrically with equal necking length in both traces. PCIe RX3 is a guideline deviation; this alone is not a compliance failure.'},
                               {'source':str(ROOT/'datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf'),'pages':[3,5],
                                'criteria':{'USB4DifferentialOhms':[75,95],'PCIeDifferentialOhms':[76.5,93.5],
                                            'USB4EverySegmentSkewMmExclusive':.0254,'PNTotalSkewMmExclusive':.127},
                                'scope':'Uniform routing guidance; no finite-neck reflection mask is supplied.'}],
            'limits':['The two coupling cases bound only the chosen line-surrogate family. They are not rigorous EM bounds or manufacturing confidence limits.',
                      'Actual necks bend, diverge and neighbor BGA pads; an invariant cross-section cannot capture all local fields. The strongest-coupling case applies the measured minimum spacing over the full neck, the other case removes mutual coupling.',
                      'P/N propagation and transfer delay are distinct metrics. Total planar length matching alone does not equal electrical matching through different widths.',
                      'Clearance proposals preserve frozen centerlines and test local top copper only. Round polygon approximations and width-transition shapes still require native DRC.',
                      'The finite sections terminate in ideal nominal trunk ports. No package, via, capacitor, connector, crosstalk, equalization, eye or BER model is used. No compliance mask is invented.'],
            'inputSha256':{str(path):sha(path) for path in files}}
    if args.current_board and args.current_handoff:
        recheck_current(result,args.current_board.resolve(),args.current_handoff.resolve())
    (out/'necks.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps([{'name':row['name'],'neckLengths':row['actualNeckLengthsMm'],
                       'recommendedLengths':row['recommendation']['retainedNeckLengthsMm'],
                       'clearancePass':row['recommendation']['clearance']['passed'],
                       'finite':[(c['couplingAssumption'],c['actualFiniteSections']['losslessMismatchInsertionLossAtNyquistDB'],c['actualFiniteSections']['propagationSkewPS']) for c in row['finiteSensitivity']]} for row in results],indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--input-root',type=Path,default=ROOT/'dist/si-channel-review/selected-stackup-inputs')
    parser.add_argument('--output-root',type=Path,default=ROOT/'dist/si-channel-review/focused-risks')
    parser.add_argument('--current-board',type=Path);parser.add_argument('--current-handoff',type=Path)
    parser.add_argument('--recheck-current-only',action='store_true')
    args=parser.parse_args()
    if args.recheck_current_only:
        assert args.current_board and args.current_handoff,'Fresh board and handoff are required'
        target=args.output_root.resolve()/'necks.json';result=load(target)
        result.setdefault('inputRoot',str(args.input_root.resolve()))
        recheck_current(result,args.current_board.resolve(),args.current_handoff.resolve())
        target.write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result['currentBoardLocalRecheck'],indent=2))
    else:main(args)
