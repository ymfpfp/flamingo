"""Reproducible nominal PCB-only impedance screen and SI review handoff.
Run: python simulations/pcie-tx/run_review.py [rendered.circuit.json]
Requires the versions in requirements.txt. All distances are millimetres.
"""
from pathlib import Path
from dataclasses import replace
import sys,json,hashlib,math
import subprocess
from datetime import datetime,timezone
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from cross_section import Section,analyze,hammerstad_single,C0
from review_geometry import load_geometry
from check_asmedia_spacing import audit as audit_asmedia_spacing

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/pcie-si';OUT.mkdir(parents=True,exist_ok=True)
args=[a for a in sys.argv[1:] if a!='--reuse-cross-sections']
source=Path(args[0] if args else ROOT/'dist/preview/circuit.json')
raw=source.read_bytes();(OUT/'input.circuit.json').write_bytes(raw)
stack_path=ROOT/'manufacturing/stackup/JLC06161H-3313.json'
stack=json.loads(stack_path.read_text());(OUT/'stackup.json').write_text(json.dumps(stack,indent=2))
geometry,routes=load_geometry(OUT/'input.circuit.json')
(OUT/'geometry.json').write_text(json.dumps(geometry,indent=2))
audit=json.loads(subprocess.check_output(['bun','-e',
    'import {auditPcieTxRouting} from "./lib/pcie-tx-routing-audit";const j=JSON.parse(await Bun.file(process.argv[1]).text());console.log(JSON.stringify(auditPcieTxRouting(j.circuitJson??j)));',
    str(OUT/'input.circuit.json')],cwd=ROOT,text=True))
if not audit['passed']:raise ValueError(audit['failures'])
(OUT/'routing-audit.json').write_text(json.dumps(audit,indent=2))
spacing=audit_asmedia_spacing(json.loads(raw))
if not spacing['passed']: raise ValueError('ASMedia 8h coupled-route isolation failed; run check_asmedia_spacing.py for details')
(OUT/'asmedia-spacing.json').write_text(json.dumps(spacing,indent=2))
profile=stack['impedanceProfiles'][0];mask=stack['solderMaskModel'];copper=profile['calculatorGuideTraceModel']
base=Section(width=profile['calculatedTraceWidthMm'],gap=profile['calculatedPairGapMm'],
    height=stack['dielectrics'][0]['thicknessMm'],er=stack['dielectrics'][0]['designDk'],
    copper=copper['outerCopperThicknessMm'],top_width_reduction=copper['topWidthReductionFromBaseMm'],
    mask_er=mask['designDk'],mask_base=mask['aboveSubstrateMm'],mask_top=mask['aboveTraceMm'])
cached=[]
if '--reuse-cross-sections' in sys.argv:
    previous=json.loads((OUT/'report.json').read_text())
    assert previous['solver_sha256']==hashlib.sha256((Path(__file__).parent/'cross_section.py').read_bytes()).hexdigest()
    assert previous['stackup_sha256']==hashlib.sha256(stack_path.read_bytes()).hexdigest()
    for value in previous.values():
        for item in value if isinstance(value,list) else [value]:
            if isinstance(item,dict) and 'inputs' in item and 'impedance_ohm' in item:cached.append(item)

def case(name,section):
    from dataclasses import asdict
    match=next((item for item in cached if item['inputs']==asdict(section) and item.get('name')==name),None)
    r=dict(match) if match else analyze(section);r['name']=name
    print(name,round(r['impedance_ohm'],3),'ohm',round(r['effective_er'],5),'effective Dk',flush=True)
    return r

mesh=[case(f'mesh_{step*1000:g}um',replace(base,step=step)) for step in [.004,.002,.001,.0005]]
nominal=mesh[-1]
expanded=case('expanded_domain',replace(base,exterior=2.4))
bench=replace(base,width=.2,height=.1,copper=0,top_width_reduction=0,mask=False,single=True,step=.0005,exterior=2.)
reference=hammerstad_single(bench.width,bench.height,bench.er)
bench_result=case('thin_unmasked_single_line_benchmark',bench)
homogeneous=case('homogeneous_dielectric_test',replace(base,homogeneous=True))
checks={'thin_line_analytic_error_percent':100*abs(bench_result['impedance_ohm']/reference-1),
    'thin_line_reference_ohm':reference,
    'last_mesh_step_change_ohm':abs(mesh[-1]['impedance_ohm']-mesh[-2]['impedance_ohm']),
    'expanded_domain_change_ohm_at_1um':abs(expanded['impedance_ohm']-mesh[-2]['impedance_ohm']),
    'homogeneous_effective_er_error':abs(homogeneous['effective_er']-base.er),
    'maximum_linear_system_relative_residual':max(r['relative_residual'] for r in mesh+[bench_result,homogeneous,expanded])}
assert checks['thin_line_analytic_error_percent']<1
assert checks['last_mesh_step_change_ohm']<.2
assert checks['expanded_domain_change_ohm_at_1um']<.1
assert checks['homogeneous_effective_er_error']<1e-9
assert checks['maximum_linear_system_relative_residual']<1e-8
sensitivity=[]
for name,s in [
    ('35um_copper_same_taper',replace(base,copper=.035)),
    ('rectangular_copper_same_base_width',replace(base,top_width_reduction=0)),
    ('solder_mask_absent',replace(base,mask=False)),
    ('width_minus_10um',replace(base,width=base.width-.01)),('width_plus_10um',replace(base,width=base.width+.01)),
    ('dielectric_minus_10um',replace(base,height=base.height-.01)),('dielectric_plus_10um',replace(base,height=base.height+.01)),
    ('Dk_minus_0.2',replace(base,er=base.er-.2)),('Dk_plus_0.2',replace(base,er=base.er+.2)),
]:sensitivity.append(case(name,s))
# These are assumed variations, not factory tolerance specifications.
gap_sweep=[case(f'gap_{g:g}mm',replace(base,gap=g)) for g in [.05,.075,.1001,.15,.2,.3,.4,.6,.8,1.2,2.]]
isolated=case('isolated_line',replace(base,single=True))
corner_gap=(base.width+base.gap)/math.cos(math.pi/8)-base.width
corner_proxy=case('uniform_gap_proxy_at_miter_corner_envelope',replace(base,gap=corner_gap))
corner_proxy['qualification']='A uniform-section sensitivity proxy, not the actual 3D corner impedance or reflection.'
cap_pad=next(p['pad'] for p in geometry['pads'] if p['name']=='TX0_P' and p['location']=='capacitor input')
cap_proxy=case('uniform_strip_proxy_for_exposed_cap_lands',replace(base,width=cap_pad['height'],gap=1.2-cap_pad['height'],mask=False))
cap_proxy['qualification']='Uniform long-strip proxy only. The actual 0.5mm-long lands and capacitor are a 3D lumped/distributed discontinuity; this value is not their measured local impedance.'
# A deliberately isolated uniform-line example explains why a short mismatch
# matters. It does not model any actual launch/trombone/via or channel S matrix.
freq=np.linspace(.05,16,400)*1e9
z=next(r for r in gap_sweep if r['name']=='gap_0.4mm')
length=.005
phase=2*np.pi*freq*math.sqrt(z['effective_er'])/C0*length
A=np.cos(phase);B=1j*z['impedance_ohm']*np.sin(phase);CC=1j*np.sin(phase)/z['impedance_ohm'];D=A
refz=85;denom=A+B/refz+CC*refz+D
reflection=(A+B/refz-CC*refz-D)/denom
transmission=2/denom
example={'description':'Illustration only: a 5 mm uniform 0.4 mm-gap section between ideal 85 ohm ports. No vias, pads, losses or bends.',
    'section_impedance_ohm':z['impedance_ohm'],'length_mm':5,
    'return_loss_db_at_8GHz':float(-20*np.log10(abs(np.interp(8e9,freq,reflection.real)+1j*np.interp(8e9,freq,reflection.imag))))}

# Geometry handoff retains actual copper, planes, pads and vias. It is not a
# solved 3D model. No unknown package/capacitor/connector models are invented.
j=json.loads(raw);j=j.get('circuitJson',j) if isinstance(j,dict) else j
gnd=next(e['source_net_id'] for e in j if e['type']=='source_net' and e['name']=='GND')
handoff={'units':'mm','stackup':stack,'source_sha256':hashlib.sha256(raw).hexdigest(),
    'pairs':{name:{stage:t['route'] for stage,t in parts.items()} for name,parts in routes.items()},
    'signal_vias':geometry['vias'],'pads':geometry['pads'],
    'ground_planes':[e for e in j if e['type']=='pcb_copper_pour' and e.get('source_net_id')==gnd],
    'all_copper_pours':[e for e in j if e['type']=='pcb_copper_pour'],
    'ground_return_vias':[e for e in j if e['type']=='pcb_via' and e.get('source_net_id')==gnd],
    'board_context':[e for e in j if e['type'] in ['pcb_board','pcb_trace','pcb_via','pcb_smtpad','pcb_plated_hole','pcb_hole','pcb_cutout']],
    'unresolved':['Factory cross-section and trace taper/tolerances','Actual dielectric dispersion, Df and foil roughness',
        'Unused internal via pads and barrel plating','Final power-plane copper and antipads','Package/connector/capacitor wideband models',
        'Port reference planes, rise-time and applicable PCIe channel/compliance masks']}
(OUT/'field-solver-handoff.json').write_text(json.dumps(handoff,indent=2))
summary=[]
for lane in range(4):
    data=[r for r in geometry['conductors'] if r['name'].startswith(f'TX{lane}_') and r['stage']=='bridge']
    summary.append({'lane':lane,'maximum_away_from_nominal_run_mm':max(r['longest_away_from_nominal_run_mm'] for r in data),
        'maximum_nearest_mate_gap_mm':max(r['max_nearest_mate_gap_mm'] for r in data),
        'minimum_nominal_gap_fraction':min(r['nominally_coupled_length_mm']/r['length_mm'] for r in data)})
report={'status':'PCB-only nominal cross-section screen complete; full impedance/SI sign-off NOT established',
    'full_channel_verified':False,'created_at_utc':datetime.now(timezone.utc).isoformat(),
    'routing_revision':'coupled trunks with balanced local BGA escapes; individual tuning loops removed',
    'unchanged_cross_section_results_reused':bool(cached),
    'routing_audit':audit,'asmedia_spacing':spacing,'miter_corner_gap_proxy':corner_proxy,
    'source_file':str(source),'source_sha256':hashlib.sha256(raw).hexdigest(),
    'solver_sha256':hashlib.sha256((Path(__file__).parent/'cross_section.py').read_bytes()).hexdigest(),
    'stackup_sha256':hashlib.sha256(stack_path.read_bytes()).hexdigest(),
    'impedance_target_ohm':85,'nominal_band_ohm':[76.5,93.5],
    'nominal_cross_section':nominal,'numerical_checks':checks,'mesh_convergence':mesh,'domain_check':expanded,
    'single_line_benchmark':bench_result,'analytic_benchmark_source':'https://qucs.sourceforge.net/tech/node75.html',
    'input_parameter_source':'https://jlcpcb.com/help/article/user-guide-to-the-jlcpcb-impedance-calculator',
    'sensitivity_note':'One parameter at a time, assumed perturbations. These are not manufacturer process limits or production yield predictions.',
    'sensitivity':sensitivity,'gap_sweep':gap_sweep,'isolated_line':isolated,'capacitor_land_proxy':cap_proxy,
    'geometry_summary':summary,'ground_return_max_distance_mm':max(v['nearest_ground_via_mm'] for v in geometry['vias']),
    'uniform_mismatch_example':example,
    'limitations':['Independent 2D electrostatic finite-volume screen; no 3D field extraction or measured S parameters.',
        'Stepped mask and trapezoid approximations use published calculator parameters, not a factory-approved as-built cross-section.',
        'No frequency dispersion, conductor/dielectric loss, roughness, radiation or adjacent-net coupling in the 2D solver.',
        'Gap sweeps model uniform parallel lines. Neither the miter-corner proxy nor the wide-gap illustration is a 3D extraction of a transition.',
        'Plane apertures and nearby ground vias are extracted, but via/launch return loss and mode conversion are not solved.',
        'Equal geometric lengths and equal via counts do not establish equal electrical delay or eye/BER compliance.']}
(OUT/'report.json').write_text(json.dumps(report,indent=2))

plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,2,figsize=(12,4.5),layout='constrained')
ax=axes[0];ax.axhspan(76.5,93.5,color='#ccebdd',label='85 ohm ±10% target')
ax.plot([r['inputs']['gap'] for r in gap_sweep],[r['impedance_ohm'] for r in gap_sweep],'o-',color='#1565c0')
ax.scatter([base.gap],[nominal['impedance_ohm']],color='#12352a',zorder=5)
ax.set(xlabel='Uniform parallel-line edge gap (mm)',ylabel='Quasi-static differential impedance (ohm)',title='Straight-section screen, not a 3D channel result',xlim=(0,1.25));ax.grid(alpha=.2)
ax.annotate(f"Nominal: {nominal['impedance_ohm']:.1f} ohm",(base.gap,nominal['impedance_ohm']),xytext=(.4,81),arrowprops={'arrowstyle':'->'})
ax.legend(loc='lower right')
ax=axes[1];ax.plot(freq/1e9,-20*np.log10(np.maximum(abs(reflection),1e-8)),color='#a33b20');ax.set_ylim(0,50)
ax.set(xlabel='Frequency (GHz)',ylabel='Return loss (dB; larger is better)',title='Illustration of removed wide-gap routing, not this channel')
ax.axvline(8,color='#555',ls='--',lw=1);ax.grid(alpha=.2)
fig.savefig(OUT/'impedance-screen.png',dpi=180);plt.close(fig)

# Show geometry with the actual reference plane openings. Red means away from
# nominal gap/alignment, not a measured impedance or proof of failure.
fig,ax=plt.subplots(figsize=(11,8),layout='constrained')
for e in handoff['ground_planes']:
    if e['layer']!='inner4':continue
    for ring in e['brep_shape'].get('inner_rings',[]):
        xy=np.array([(p['x'],p['y']) for p in ring['vertices']])
        if xy[:,0].min()<34 and xy[:,0].max()>0 and xy[:,1].min()<104 and xy[:,1].max()>82:
            ax.fill(xy[:,0],xy[:,1],color='#d8d8d8',zorder=0)
for r in geometry['conductors']:
    if r['stage']!='bridge':continue
    samples=r['samples'];segments=[];colors=[]
    for a,b in zip(samples,samples[1:]):
        if a['layer']==b['layer']=='bottom':
            segments.append([(a['x'],a['y']),(b['x'],b['y'])])
            good=lambda p:p['coupled'] or (p['in_coupled_trunk'] and p['corner_envelope_valid'])
            colors.append('#147d6b' if good(a) and good(b) else '#cb432f')
    ax.add_collection(LineCollection(segments,colors=colors,linewidths=1.6))
for v in geometry['vias']:ax.plot(v['x'],v['y'],'o',ms=3,color='#352c78')
for lane in range(4):
    ax.text(3,[98.3608,93.3608,89.3608,85.3608][lane]+.4,f'TX{lane}',weight='bold')
ax.set(xlim=(.3,33.5),ylim=(83,104),xlabel='Board X (mm)',ylabel='Board Y (mm)',title='Revised TX routes: teal = coupled trunks / bends; red = local launches\nGrey = L5 copper openings; points = signal vias. No individual tuning loops remain.')
ax.set_aspect('equal');ax.grid(alpha=.15)
fig.savefig(OUT/'geometry-review.png',dpi=180);plt.close(fig)

field=analyze(replace(base,step=.001),keep_field=True)['field']
x=field['x'];y=field['y'];v=field['potential'];metal=field['metal']
fig,ax=plt.subplots(figsize=(8,4),layout='constrained')
ax.pcolormesh(x,y,np.ma.masked_where(metal,v),shading='nearest',cmap='viridis',vmin=0,vmax=.5)
ax.contour(x,y,v,levels=np.linspace(.025,.475,10),colors='white',linewidths=.4,alpha=.7)
ax.contourf(x,y,metal.astype(float),levels=[.5,1.5],colors=['#bc732b'])
ax.axhline(base.height,color='white',ls='--',lw=.8)
ax.set(xlim=(0,.4),ylim=(0,.3),xlabel='X from pair symmetry plane (mm)',ylabel='Height above GND plane (mm)',title='Independent 2D odd-mode solve: one half of the symmetric pair\nPEC trace = +0.5 V; symmetry / ground = 0 V; mirrored trace = −0.5 V')
ax.set_aspect('equal');fig.savefig(OUT/'cross-section-field.png',dpi=180);plt.close(fig)
print('Saved',OUT/'report.json',flush=True)
