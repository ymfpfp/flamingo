"""Read-only, source-bound ASM2464PDX physical integration audit.

No package circuit model or native field solve is used.  Connectivity is checked
on emitted copper, while electrical package performance remains explicitly open.
"""
from pathlib import Path
from collections import Counter, defaultdict
import argparse, datetime, hashlib, json, math, re, sys
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from copper_geometry import copper_objects


def load(path):
    return json.loads(Path(path).read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def ball(port):
    return next(x for x in reversed(port['port_hints']) if re.fullmatch('[A-Z]+[0-9]+', x))


def polygon(pour):
    b = pour['brep_shape']
    return Polygon([(p['x'], p['y']) for p in b['outer_ring']['vertices']],
                   [[(p['x'], p['y']) for p in r['vertices']] for r in b.get('inner_rings', [])])


def xy(obj):
    return Point(obj['x'], obj['y'])


def expected_signal(channel, polarity):
    if channel.startswith('USB4_'):
        direction, index = re.fullmatch('USB4_(TX|RX)([12])', channel).groups()
        return f'U{direction}{polarity}{int(index)-1}'
    direction, index = re.fullmatch('PCIE_(TX|RX)([0-3])', channel).groups()
    return f'P{direction}{polarity}{index}'


def route_graph(route):
    edges, adjacency = set(), defaultdict(set)
    def node(p, layer):
        return (round(p['x'], 7), round(p['y'], 7), layer)
    def edge(a, b):
        if a != b:
            edges.add(tuple(sorted((a, b))))
            adjacency[a].add(b)
            adjacency[b].add(a)
    for a, b in zip(route, route[1:]):
        if a['route_type'] == b['route_type'] == 'wire' and a['layer'] == b['layer']:
            edge(node(a, a['layer']), node(b, b['layer']))
    for p in route:
        if p['route_type'] == 'via':
            edge(node(p, p['from_layer']), node(p, p['to_layer']))
    unseen, components = set(adjacency), 0
    while unseen:
        components += 1
        pending = [unseen.pop()]
        while pending:
            for n in adjacency[pending.pop()]:
                if n in unseen:
                    unseen.remove(n)
                    pending.append(n)
    degrees = Counter(len(v) for v in adjacency.values())
    return {'connectedComponents': components, 'degreeOneEndpoints': degrees[1],
            'branchNodes': sum(v for k, v in degrees.items() if k > 2),
            'edges': len(edges), 'passed': components == 1 and degrees[1] == 2 and max(degrees, default=0) <= 2,
            'scope': 'Explicit centerline route graph; coincident nodes merged at 1e-7 mm. Does not substitute for copper DRC.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT / 'dist/si-channel-review/launch-review')
    args = parser.parse_args()
    out = args.root.resolve()
    board_path, geometry_path, handoff_path = [out / f for f in ('board.circuit.json', 'geometry.json', 'field-solver-handoff.json')]
    data, geometry, handoff = load(board_path), load(geometry_path), load(handoff_path)
    board = data.get('circuitJson', data) if isinstance(data, dict) else data
    board_hash = sha(board_path)
    assert geometry['sourceSha256'] == handoff['sourceSha256'] == board_hash
    stack_path = ROOT / 'manufacturing/stackup/selected.json'
    assert geometry['stackup']['code'] == load(stack_path)['code']
    text_path = out / 'ASM2464PDX-datasheet.txt'
    text = text_path.read_text()
    primary = {m[2]: {'signal': m[1], 'direction': m[3]} for m in
               re.finditer(r'^\s*((?:UTX|URX|PTX|PRX)[PN]\d)\s+([A-Z]+\d+)\s+Di\s+([IO])\s', text, re.M)}
    assert len(primary) == 24, 'Primary datasheet pin table parse must find all 24 signals'
    component = next(e for e in board if e['type'] == 'source_component' and e.get('name') == 'ASM2464PDX')
    sid = component['source_component_id']
    pc = next(e for e in board if e['type'] == 'pcb_component' and e.get('source_component_id') == sid)
    ports = {e['source_port_id']: e for e in board if e['type'] == 'source_port' and e.get('source_component_id') == sid}
    pcbports = {e['source_port_id']: e for e in board if e['type'] == 'pcb_port' and e.get('source_port_id') in ports}
    pads = {e['pcb_port_id']: e for e in board if e['type'] == 'pcb_smtpad' and e.get('pcb_component_id') == pc['pcb_component_id']}
    traces = {e['pcb_trace_id']: e for e in board if e['type'] == 'pcb_trace'}
    vias = [e for e in board if e['type'] == 'pcb_via']
    objects = copper_objects(board)
    top = unary_union([o['shape'] for o in objects if 'top' in o['layers']])
    top_parts = list(top.geoms) if hasattr(top, 'geoms') else [top]
    planes = {layer: unary_union([polygon(p) for p in handoff['groundPlanes'] if p['layer'] == layer]) for layer in ('inner1', 'inner4')}
    reference_vias = [v for v in vias if all(layer in v['layers'] and
        xy(v).buffer(v['outer_diameter']/2, quad_segs=32).intersection(plane).area > 1e-8
        for layer, plane in planes.items())]
    grounded_parts = {i for i, part in enumerate(top_parts) if any(part.distance(xy(v)) <= v['outer_diameter']/2 + 1e-8 for v in reference_vias)}
    grounds = []
    for sp in ports.values():
        if sp['name'] not in ('GND', 'GNDA'):
            continue
        pad = pads[pcbports[sp['source_port_id']]['pcb_port_id']]
        parts = [i for i, part in enumerate(top_parts) if part.distance(xy(pad)) < 1e-8]
        connected = any(i in grounded_parts for i in parts)
        candidates = [v for v in reference_vias if any(top_parts[i].distance(xy(v)) <= v['outer_diameter']/2 + 1e-8 for i in parts)]
        nearest = min(candidates, key=lambda v: xy(v).distance(xy(pad))) if candidates else None
        grounds.append({'ball': ball(sp), 'signal': sp['name'], 'x': pad['x'], 'y': pad['y'],
                        'physicallyConnectedToBothReferencePlanes': connected,
                        'nearestConnectedReferenceViaId': nearest['pcb_via_id'] if nearest else None,
                        'nearestConnectedReferenceViaCenterDistanceMm': xy(nearest).distance(xy(pad)) if nearest else None})
    assert len(grounds) == 96

    grid = []
    rows = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','R','T','U','V','W','Y','AA']
    inner_rows, inner_cols = ['D','E','F','H','J','L','N','P','T','U','V'], [4,5,6,8,9,11,13,14,16,17,18]
    angle = math.radians(-pc['rotation'])
    for sp in ports.values():
        b = ball(sp)
        row, col = re.fullmatch('([A-Z]+)([0-9]+)', b).groups()
        col = int(col)
        if row in ('A','B','Y','AA') or col in (1,2,20,21):
            ex, ey, pitch = (col-11)*.46, -(rows.index(row)-10)*.46, .46
        else:
            ex, ey, pitch = (inner_cols.index(col)-5)*.65, -(inner_rows.index(row)-5)*.65, .65
        p = pads[pcbports[sp['source_port_id']]['pcb_port_id']]
        dx, dy = p['x']-pc['center']['x'], p['y']-pc['center']['y']
        lx, ly = dx*math.cos(angle)-dy*math.sin(angle), dx*math.sin(angle)+dy*math.cos(angle)
        grid.append({'ball': b, 'pitchMm': pitch, 'centerErrorMm': math.hypot(lx-ex, ly-ey),
                     'shape': p['shape'], 'copperWidthMm': p.get('width', 2*p.get('radius', 0)),
                     'copperHeightMm': p.get('height', 2*p.get('radius', 0)), 'solderMaskMarginMm': p.get('soldermask_margin')})
    assert len(grid) == len({r['ball'] for r in grid}) == 273

    channels, all_signal_vias, pin_errors, graphs = [], {}, [], []
    stage_binding = True
    speed_ids = set()
    for channel in geometry['channels']:
        cs = []
        for c in channel['conductors']:
            sp = ports[c['start']['source_port_id']]
            speed_ids.add(sp['source_port_id'])
            expected = expected_signal(channel['name'], c['polarity'])
            parsed = primary[c['ball']]
            matched = parsed['signal'] == sp['name'] == expected and ball(sp) == c['ball']
            if not matched:
                pin_errors.append({'channel': channel['name'], 'polarity': c['polarity']})
            p = pads[c['start']['pcb_port_id']]
            ground = min(grounds, key=lambda g: xy(g).distance(xy(p)))
            stage = c['stages'][0]
            graph = route_graph(stage['route'])
            graphs.append(graph)
            for st in c['stages']:
                actual_route = traces[st['traceId']]['route']
                # Handoff extraction orients each stage along the complete path.
                # A physical trace may therefore appear in the opposite order.
                stage_binding &= actual_route == st['route'] or list(reversed(actual_route)) == st['route']
                for v in st['vias']:
                    matches = [r for r in st['route'] if r['route_type'] == 'via' and xy(r).distance(xy(v)) < 1e-7]
                    used_top_bottom = any({r['from_layer'], r['to_layer']} == {'top','bottom'} for r in matches)
                    all_signal_vias[v['pcb_via_id']] = {
                        'id': v['pcb_via_id'], 'channel': channel['name'], 'polarity': c['polarity'],
                        'traceId': st['traceId'], 'x': v['x'], 'y': v['y'],
                        'outerDiameterMm': v['outer_diameter'], 'drillMm': v['hole_diameter'],
                        'nominalAnnularRingMm': (v['outer_diameter']-v['hole_diameter'])/2,
                        'layers': v['layers'], 'routedTopBottomEndpoints': used_top_bottom,
                        'unusedBarrelExtensionBeyondUsedEndpointsMm': 0 if used_top_bottom else None,
                        'referencePlaneDrillToCopperGapMm': {l: xy(v).distance(q)-v['hole_diameter']/2 for l,q in planes.items()},
                        'nearestBothPlaneReturnViaCenterDistanceMm': min(xy(v).distance(xy(g)) for g in reference_vias)}
            via_route = next((r for r in stage['route'] if r['route_type'] == 'via'), None)
            initial_length = 0.
            for a,b in zip(stage['route'], stage['route'][1:]):
                if b['route_type'] == 'via':
                    break
                if a['route_type'] == b['route_type'] == 'wire' and a['layer'] == b['layer']:
                    initial_length += xy(a).distance(xy(b))
            unused_stage_vias = [v['pcb_via_id'] for v in vias if v.get('pcb_trace_id') == stage['traceId'] and
                not any(r['route_type'] == 'via' and xy(r).distance(xy(v)) < 1e-7 for r in stage['route'])]
            cs.append({'polarity': c['polarity'], 'ball': c['ball'], 'sourceSignal': sp['name'], 'expectedSignal': expected,
                       'datasheetSignal': parsed['signal'], 'datasheetDirection': parsed['direction'], 'pinMappingPassed': matched,
                       'land': {k: p[k] for k in ('shape','radius','width','height','soldermask_margin') if k in p},
                       'nearestReferenceGroundBall': {k: ground[k] for k in ('ball','signal','physicallyConnectedToBothReferencePlanes')},
                       'nearestReferenceGroundBallCenterDistanceMm': xy(p).distance(xy(ground)),
                       'completePathPlanarLengthMm': c['lengthMm'], 'completePathViaCount': len({v['pcb_via_id'] for st in c['stages'] for v in st['vias']}),
                       'bgaStageTraceId': stage['traceId'], 'explicitBgaStageGraph': graph,
                       'unusedAttachedBgaStageViaIds': unused_stage_vias,
                       'firstBgaStageVia': None if via_route is None else {
                           'x': via_route['x'], 'y': via_route['y'],
                           'padCenterDistanceMm': xy(p).distance(xy(via_route)),
                           'routedPlanarLengthFromBallMm': initial_length,
                           'viaInPadAtBallCenter': xy(p).distance(xy(via_route)) < 1e-7,
                           'nearestBothPlaneReturnViaCenterDistanceMm': min(xy(via_route).distance(xy(v)) for v in reference_vias)}})
        channel_vias = [c['firstBgaStageVia'] for c in cs]
        asymmetry = None if any(v is None for v in channel_vias) else abs(channel_vias[0]['routedPlanarLengthFromBallMm']-channel_vias[1]['routedPlanarLengthFromBallMm'])
        channels.append({'name': channel['name'], 'conductors': cs, 'initialTopEscapeLengthDifferenceMm': asymmetry,
                         'totalPlanarLengthDifferenceMm': abs(cs[0]['completePathPlanarLengthMm']-cs[1]['completePathPlanarLengthMm']),
                         'status': 'warn' if asymmetry and asymmetry > 1e-6 else 'pass',
                         'scope': 'Measured physical asymmetry; no package delay or mode-conversion failure threshold is inferred.'})
    internal_signal_groups = [g for g in component.get('internally_connected_source_port_ids', []) if speed_ids.intersection(g)]
    assert stage_binding
    unused = []
    for sp in ports.values():
        if re.fullmatch('REFCLK_[PN][1-3]|PERST[1-3]_N', sp['name']):
            pp = pcbports[sp['source_port_id']]
            connected = [t['pcb_trace_id'] for t in traces.values() if pp['pcb_port_id'] in
                         (t.get('start_pcb_port_id'), t.get('end_pcb_port_id'))]
            # Native traces expose endpoint port ids through route endpoints on some versions.
            connected += [t['pcb_trace_id'] for t in traces.values() if any(xy(r).distance(xy(pp)) < 1e-7
                          and r.get('layer') == 'top' for r in (t['route'][:1]+t['route'][-1:]))]
            unused.append({'signal': sp['name'], 'ball': ball(sp), 'physicalTraceIds': sorted(set(connected)),
                           'sourceConnectivityKey': sp.get('subcircuit_connectivity_map_key')})
    nominal_used_span = sum(d['thicknessMm'] for d in geometry['stackup']['dielectrics']) + sum(
        l['thicknessMm'] for l in geometry['stackup']['copperLayers'][1:-1])
    signal_vias = list(all_signal_vias.values())
    all_layers = {'top','inner1','inner2','inner3','inner4','bottom'}
    through_pass = all(v['routedTopBottomEndpoints'] and set(v['layers']) == all_layers for v in signal_vias)
    check = lambda key,status,value,scope: {'id':key,'status':status,'value':value,'scope':scope}
    checks = [
        check('primaryHighSpeedPinMapping', 'pass' if not pin_errors else 'fail', {'checked':24,'errors':pin_errors}, 'Actual rendered ball, source signal, channel TX/RX and P/N against primary PDX pin tables, PDF pp13–14.'),
        check('bgaGrid', 'pass' if max(r['centerErrorMm'] for r in grid) < 1e-8 else 'fail', {'balls':273,'maximumCenterErrorMm':max(r['centerErrorMm'] for r in grid)}, 'Mixed-pitch mechanical drawing pp22–23; .46 mm perimeter/.65 mm interior, placed rotation included.'),
        check('groundBallReferenceConnectivity', 'pass' if all(g['physicallyConnectedToBothReferencePlanes'] for g in grounds) else 'fail', {'checked':96,'connected':sum(g['physicallyConnectedToBothReferencePlanes'] for g in grounds)}, 'Top emitted copper polygon connectivity to a via contacting both inner1 and inner4 GND polygons. Excludes package die/bond and AC return inductance.'),
        check('packageRouteBranches', 'pass' if all(g['passed'] for g in graphs) and not any(c['unusedAttachedBgaStageViaIds'] for ch in channels for c in ch['conductors']) else 'fail', {'checkedBgaStageRoutes':len(graphs),'failedGraphs':sum(not g['passed'] for g in graphs)}, 'Explicit first physical trace stages, excluding intended capacitor/ESD branches beyond package stage.'),
        check('signalThroughViaEndpoints', 'pass' if through_pass else 'fail', {'uniqueVias':len(signal_vias),'allUsedTopToBottom':through_pass,'unusedBarrelExtensionBeyondUsedEndpointsMm':0 if through_pass else None}, 'All 12 complete high-speed paths, not just BGA vias. Used endpoints are the two outer layers, so through barrel has no extension beyond them.'),
        check('internallyShortedHighSpeedPins', 'pass' if not internal_signal_groups else 'fail', internal_signal_groups, 'Source component internally-connected groups must not contain high-speed signal pins.'),
        check('unusedX4ClockResetOutputs', 'pass' if all(not x['physicalTraceIds'] and x['sourceConnectivityKey'] is None for x in unused) else 'fail', {'checked':len(unused),'outputs':unused}, 'x4 port mapping p15 leaves REFCLK1–3 and PERST1–3 unused; firmware mode itself is not verified.'),
        check('landStencilViaVendorAcceptance', 'unknown', {'vendorAcceptanceReceived':load(ROOT/'manufacturing/bridge-bga/process.json')['vendorAcceptance']['received']}, 'Datasheet supplies package balls, not an approved PCB land/stencil design. Filled/capped .25/.15 mm signal via in a nominal .20 mm land changes effective copper.'),
        check('perLayerRetainedViaPads', 'unknown', {'emittedLayers':sorted(all_layers)}, 'CircuitJSON emits common outer diameter across six layers. Independent nonfunctional-pad removal/retention and final fabrication padstack are not established by this audit.'),
        check('packageLaunchElectricalPerformance', 'unknown', None, 'Package/die S parameters or IBIS-AMI, per-pin package delay, and measured PCB launches unavailable; planar symmetry alone does not determine electrical skew or conversion.')]
    body = box(pc['center']['x']-5,pc['center']['y']-5,pc['center']['x']+5,pc['center']['y']+5)
    source_names = {e['source_component_id']: e['name'] for e in board if e['type']=='source_component'}
    neighbors = []
    for e in board:
        if e['type'] != 'pcb_component' or e is pc or e.get('source_component_id') not in source_names:
            continue
        b = box(e['center']['x']-e['width']/2,e['center']['y']-e['height']/2,e['center']['x']+e['width']/2,e['center']['y']+e['height']/2)
        neighbors.append({'name':source_names[e['source_component_id']], 'bodyBoxGapMm':body.distance(b), 'overlapAreaMm2':body.intersection(b).area})
    result = {
        'updatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'screenVerdict':'warn',
        'summary':'No confirmed P/N, TX/RX, explicit package-route branch, or missing reference-ground connection error. Physical launch asymmetries remain measurable; assembly and package performance require vendor data.',
        'scope':'Read-only post-RX3-width-fix package integration geometry/netlist audit; no native simulation, eye, BER, compliance or first-try probability claim.',
        'provenance':{'sourceSha256':board_hash,'geometrySha256':sha(geometry_path),'handoffSha256':sha(handoff_path),
                      'stackupSha256':sha(stack_path),'sourceScriptSha256':sha(__file__),
                      'primaryDatasheetSha256':sha(ROOT/'datasheets/ASM2464PDX_DataSheet_R0_3.pdf'),
                      'primaryReferenceSchematicSha256':sha(ROOT/'datasheets/ASM2464PDX_TI_R03.pdf'),
                      'primaryPcbGuideSha256':sha(ROOT/'datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf'),
                      'processSha256':sha(ROOT/'manufacturing/bridge-bga/process.json'),
                      'sourceFiles':[str(p.relative_to(ROOT)) for p in (board_path,geometry_path,handoff_path,stack_path)]},
        'checks':checks, 'channels':channels, 'grounds':grounds,
        'packageMechanical':{'part':'ASM2464PDX','balls':273,'bodyMm':[10,10],'ballNominalDiameterMm':.23,
                             'sourcePages':[22,23],'componentLayer':pc['layer'],'componentRotationDegrees':pc['rotation'],
                             'landShapeCounts':dict(Counter(r['shape'] for r in grid)), 'grid':grid,
                             'nearestSourceBackedComponentBoundingBox':min(neighbors,key=lambda n:n['bodyBoxGapMm']),
                             'bodyBoxOverlaps':[n for n in neighbors if n['overlapAreaMm2']>1e-8],
                             'landApprovalStatus':'Engineering footprint candidate; mechanical package dimensions are not land-pattern approval.'},
        'referenceReturnMethod':{'referenceViaCountPhysicallyTouchingBothPlanes':len(reference_vias),
                                 'planeLayers':['inner1','inner4'],'contactMinimumAreaMm2':1e-8,
                                 'note':'All top copper is unioned, including anonymous generated ground copper; net tags alone miss valid physical ground paths. This proves emitted geometric reach, not AC impedance.'},
        'signalVias':signal_vias,'nominalTopBottomReferenceSurfaceSpanMm':nominal_used_span,
        'findings':[
            {'status':'pass','finding':'All 24 high-speed P/N and direction assignments match the primary PDX datasheet.'},
            {'status':'warn','finding':'Several pairs use a via at one ball and a lateral escape at the other. PCIE_TX3 has the longest unequal initial top escape; total planar matching does not cancel different launch field geometry. No quantified failure follows without a package/3D model.'},
            {'status':'unknown','finding':'Vendor acceptance is still absent for the mixed circular/oblong lands, filled/capped via-in-pad, mask and stencil combination.'},
            {'status':'unknown','finding':'The emitted six-layer via model cannot prove the final manufacturing padstack or retained inner-layer pad dimensions.'}]
    }
    (out/'package-bga.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'output':str(out/'package-bga.json'),'checks':[(c['id'],c['status']) for c in checks],
                      'vias':len(signal_vias),'groundBalls':len(grounds),'returnVias':len(reference_vias)}))


if __name__ == '__main__':
    main()
