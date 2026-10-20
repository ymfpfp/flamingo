"""Screen uniform USB4 sections and export actual geometry for 3D EM analysis.

Run with the Python dependencies in ../pcie-tx/requirements.txt:
  python simulations/usb4/review_impedance.py [rendered.circuit.json]
This script does not route copper or solve the finite pads, bends, or vias.
"""
from pathlib import Path
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import json
import math
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from cross_section import Section, analyze, hammerstad_single
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

OUT = ROOT / 'dist/usb4-si'
OUT.mkdir(parents=True, exist_ok=True)
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist/usb4-routing/board.circuit.json'
raw = source.read_bytes()
j = json.loads(raw)
if isinstance(j, dict):
    j = j['circuitJson']
stack_path = ROOT / 'manufacturing/stackup/JLC06161H-3313.json'
stack_raw = stack_path.read_bytes()
stack = json.loads(stack_raw)
(OUT / 'input.circuit.json').write_bytes(raw)
(OUT / 'stackup.json').write_bytes(stack_raw)
sha = hashlib.sha256(raw).hexdigest()

sources = {e['source_trace_id']: e for e in j if e['type'] == 'source_trace'}
routes = {sources[t['source_trace_id']]['name']: t for t in j
          if t['type'] == 'pcb_trace' and t.get('source_trace_id') in sources
          and sources[t['source_trace_id']].get('name', '').startswith('USB4_')}
expected = {f'USB4_{pair}_{pol}_{stage}' for pair in ['TX1', 'TX2', 'RX1', 'RX2']
            for pol in 'PN' for stage in ['PHY_A', 'PHY_B', 'CON_A', 'CON_B']}
assert set(routes) == expected, 'A fresh, complete USB4 routing build is required'
assert len([e for e in j if e['type'] == 'pcb_trace' and e.get('source_trace_id') in sources
            and sources[e['source_trace_id']].get('name', '').startswith('USB4_')]) == 32
gnd = next(e['source_net_id'] for e in j if e['type'] == 'source_net' and e['name'] == 'GND')
vias = [e for e in j if e['type'] == 'pcb_via']
ground_vias = [v for v in vias if v.get('source_net_id') == gnd
               and {'inner1', 'inner4'}.issubset(v['layers'])]
assert ground_vias
planes = [e for e in j if e['type'] == 'pcb_copper_pour' and e.get('source_net_id') == gnd]
plane_shapes = {p['layer']: Polygon(
    [(v['x'], v['y']) for v in p['brep_shape']['outer_ring']['vertices']],
    [[(v['x'], v['y']) for v in ring['vertices']] for ring in p['brep_shape'].get('inner_rings', [])])
    for p in planes}
assert {'inner1', 'inner4'}.issubset(plane_shapes)
assert all(p.is_valid for p in plane_shapes.values())
ports = {e['source_port_id']: e for e in j if e['type'] == 'pcb_port'}
signal_vias = []
launch_pads = {}
route_geometry = []
for name, trace in sorted(routes.items()):
    points = trace['route']
    own_vias = []
    for p in points:
        if p['route_type'] != 'via':
            continue
        matches = [v for v in vias if v.get('pcb_trace_id') == trace['pcb_trace_id']
                   and math.hypot(v['x'] - p['x'], v['y'] - p['y']) < 1e-6]
        assert len(matches) == 1, f'Missing rendered via: {name}'
        v = matches[0]
        own_vias.append(Point(v['x'], v['y']))
        apertures = {}
        for layer, plane in plane_shapes.items():
            apertures[layer] = [{'bounds_mm': list(poly.bounds), 'area_mm2': poly.area,
                                 'vertices': list(poly.exterior.coords)}
                                for ring in plane.interiors if (poly := Polygon(ring)).covers(own_vias[-1])]
        signal_vias.append({'trace': name, 'via': v,
                            'nearest_ground_via_mm': min(math.hypot(v['x'] - r['x'], v['y'] - r['y']) for r in ground_vias),
                            'plane_openings': apertures})
    length = 0.
    neck_length = 0.
    unsupported_length = 0.
    unsupported_outside_own_apertures = 0.
    for a, b in zip(points, points[1:]):
        if a['route_type'] != 'wire' or b['route_type'] != 'wire' or a['layer'] != b['layer']:
            continue
        line = LineString([(a['x'], a['y']), (b['x'], b['y'])])
        length += line.length
        if abs(a['width'] - .0762) < 1e-6:
            neck_length += line.length
        plane = plane_shapes['inner1' if a['layer'] == 'top' else 'inner4']
        unsupported = line.difference(plane)
        own_openings = unary_union([Polygon(ring) for ring in plane.interiors
                                   if any(Polygon(ring).covers(v) for v in own_vias)])
        unsupported_length += unsupported.length
        unsupported_outside_own_apertures += unsupported.difference(own_openings).length
    route_geometry.append({'trace': name, 'copper_length_mm': length, 'neck_length_mm': neck_length,
                           'centerline_over_plane_opening_mm': unsupported_length,
                           'outside_own_via_apertures_mm': unsupported_outside_own_apertures})
    for source_port in sources[trace['source_trace_id']]['connected_source_port_ids']:
        pcb_port = ports[source_port]
        for pad in j:
            if pad['type'] in ['pcb_smtpad', 'pcb_plated_hole'] and pad.get('pcb_port_id') == pcb_port['pcb_port_id']:
                launch_pads[pad.get('pcb_smtpad_id', pad.get('pcb_plated_hole_id'))] = pad
assert len(signal_vias) == 16
for pair in ['TX1', 'TX2', 'RX1', 'RX2']:
    for pol in 'PN':
        assert sum(v['trace'].startswith(f'USB4_{pair}_{pol}_') for v in signal_vias) == 2

handoff = {
    'status': 'Geometry handoff only; no 3D solver project or S-parameters have been generated',
    'units': 'mm', 'source_sha256': sha, 'stackup': stack,
    'signal_routes': routes, 'signal_vias': signal_vias, 'signal_launch_pads': list(launch_pads.values()),
    'ground_planes': planes, 'ground_return_vias': ground_vias,
    'board_context': [e for e in j if e['type'] in ['pcb_board', 'pcb_trace', 'pcb_via', 'pcb_smtpad',
                                                   'pcb_plated_hole', 'pcb_hole', 'pcb_cutout', 'pcb_copper_pour']],
    'recommended_model_order': [
        'RX1/TX2 top BGA escapes: asymmetric necks, neighboring BGA lands and ground vias',
        'TX1/RX2 bottom BGA escapes: filled/capped via-in-pad, outer via and return path',
        'ESD, capacitor and discharge-resistor pad launches; include component wideband models separately',
        'Near/far USB-C row launches, connector vias and metal shell'],
    'unresolved_inputs': [
        'Factory-confirmed finished copper profile, dielectric and solder-mask dimensions/tolerances',
        'Frequency-dependent Dk/Df and foil roughness',
        'Finished barrel plating, retained inner via pads, fill/cap construction',
        'Final L3/L4 power copper and antipads; only L2/L5 pours exist in this draft',
        'BGA solder balls and package, ESD, capacitor, shunt resistor and connector wideband models',
        'Port locations, reference planes, bandwidth/rise time and allocated channel return-loss/mode-conversion masks']}
(OUT / 'field-solver-handoff.json').write_text(json.dumps(handoff, indent=2) + '\n')

profile = stack['impedanceProfiles'][0]
metal = profile['calculatorGuideTraceModel']
mask = stack['solderMaskModel']
base = Section(width=profile['calculatedTraceWidthMm'], gap=profile['calculatedPairGapMm'],
               height=stack['dielectrics'][0]['thicknessMm'], er=stack['dielectrics'][0]['designDk'],
               copper=metal['outerCopperThicknessMm'], top_width_reduction=metal['topWidthReductionFromBaseMm'],
               mask_er=mask['designDk'], mask_base=mask['aboveSubstrateMm'], mask_top=mask['aboveTraceMm'])
cases = [
    ('normal_parallel_pair', base),
    ('uniform_3mil_same_edge_gap_proxy', replace(base, width=.0762)),
    ('uniform_3mil_same_center_pitch_proxy', replace(base, width=.0762, gap=base.gap + base.width - .0762)),
    ('isolated_3mil_line', replace(base, width=.0762, single=True, exterior=4.8))]
screens = []
for name, section in cases:
    meshes = []
    for step in [.002, .001, .0005]:
        r = analyze(replace(section, step=step))
        r['pair_comparison_ohm'] = r['impedance_ohm'] * (2 if section.single else 1)
        meshes.append(r)
        print(name, f'{step*1000:g} um mesh:', f"{r['pair_comparison_ohm']:.3f} ohm", flush=True)
    expanded = analyze(replace(section, step=.001, exterior=section.exterior*2))
    factor = 2 if section.single else 1
    convergence = abs(meshes[-1]['pair_comparison_ohm'] - meshes[-2]['pair_comparison_ohm'])
    domain_change = abs(expanded['impedance_ohm']*factor - meshes[-2]['pair_comparison_ohm'])
    assert convergence < .3 and domain_change < .2, f'Numerical convergence needs review: {name}'
    assert max(r['relative_residual'] for r in meshes + [expanded]) < 1e-8
    screens.append({'name': name, 'meshes': meshes, 'expanded_domain': expanded,
                    'mesh_change_ohm': convergence, 'domain_change_ohm': domain_change,
                    'pair_comparison_ohm': meshes[-1]['pair_comparison_ohm'],
                    'interpretation': 'Twice the isolated single-line impedance; zero-coupling comparison only'
                    if section.single else 'Uniform infinite parallel cross-section; not the actual finite escape'})
benchmark = replace(base, width=.2, height=.1, copper=0, top_width_reduction=0,
                    mask=False, single=True, step=.001, exterior=2.)
bench_result = analyze(benchmark)
analytic = hammerstad_single(benchmark.width, benchmark.height, benchmark.er)
bench_error = 100*abs(bench_result['impedance_ohm']/analytic - 1)
assert bench_error < 1
report = {
    'status': 'Uniform-section screening and geometry extraction complete; transition impedance verification remains open',
    'created_at_utc': datetime.now(timezone.utc).isoformat(), 'source_file': str(source), 'source_sha256': sha,
    'stackup_sha256': hashlib.sha256(stack_raw).hexdigest(),
    'cross_section_solver_sha256': hashlib.sha256((ROOT / 'simulations/pcie-tx/cross_section.py').read_bytes()).hexdigest(),
    'full_3d_solver_run': False, 'transition_verification_complete': False,
    'target_differential_ohm': 85, 'asmedia_guideline_band_ohm': [75, 95], 'requested_fabrication_band_ohm': [76.5, 93.5],
    'uniform_cross_sections': screens, 'analytic_benchmark': {'result': bench_result, 'reference_ohm': analytic,
                                                            'error_percent': bench_error},
    'geometry': route_geometry, 'signal_via_count': len(signal_vias),
    'maximum_nearest_ground_via_distance_mm': max(v['nearest_ground_via_mm'] for v in signal_vias),
    'limitations': [
        'The 3 mil cross-sections are illustrative proxies. The actual necks bend, diverge and see nearby BGA copper.',
        'These uniform proxies are not upper/lower bounds and do not prove a transition pass or failure.',
        'The 2D PEC model excludes 3D pad/via capacitance, return-path inductance, losses, dispersion and mode conversion.',
        'Plane-centerline checks do not assess the full electromagnetic field footprint.',
        'No S-parameters, TDR or electrical delay have been extracted from the actual transitions.',
        'TDR results need a stated bandwidth and rise time; local discontinuities need channel-budget assessment.'],
    'sources': ['https://qucs.sourceforge.net/tech/node75.html',
                'https://jlcpcb.com/help/article/user-guide-to-the-jlcpcb-impedance-calculator',
                'https://docs.openems.de/en/latest/concepts/ports.html',
                'https://docs.openems.de/en/latest/python/openEMS/Tutorials/StripLine2MSL.html',
                'datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf']}
(OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print('Saved', OUT / 'report.json', flush=True)
print('Signal vias:', len(signal_vias), '| transition verification remains open', flush=True)

# Scientific plot of uniform cross-sections only; no fabricated TDR trace.
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(9, 4.8), layout='constrained')
ax.axhspan(75, 95, color='#e7edf5', label='ASMedia uniform-line band: 75–95 Ω')
ax.axhspan(76.5, 93.5, color='#cae9dd', label='Requested fabrication band: 76.5–93.5 Ω')
labels = ['Normal pair', '3 mil pair\nsame edge gap', '3 mil pair\nsame center pitch', '2 × isolated\n3 mil line']
values = [s['pair_comparison_ohm'] for s in screens]
ax.scatter(range(4), values, s=70, color=['#166d57', '#b05627', '#b05627', '#76528f'], zorder=3)
for x, value in enumerate(values):
    ax.annotate(f'{value:.1f} Ω', (x, value), xytext=(0, 9), textcoords='offset points', ha='center')
ax.set_xticks(range(4), labels)
ax.set(xlim=(-.5, 3.5), ylim=(65, max(values)+13), ylabel='Differential comparison (Ω)',
       title='Uniform cross-section screen — actual BGA transitions remain unsolved')
ax.spines[['top', 'right']].set_visible(False)
ax.grid(axis='y', alpha=.2)
ax.legend(loc='upper left', fontsize=9)
fig.savefig(OUT / 'uniform-section-screen.png', dpi=170)
plt.close(fig)
