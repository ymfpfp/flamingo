"""Compare unchanged emitted copper under two explicit fabrication recipes.

Run with simulations/pcie-tx/requirements.txt installed. This creates analysis
artifacts only; it never changes the selected stackup, routes, or fab exports.
The existing DC modules receive process-local STACK and z overrides, including
the changed via spans. Each recipe clears the optional mesh cache.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/stackup-half-ounce-review-2026-10-26'
sys.path.insert(0, str(ROOT / 'simulations/power-distribution'))
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


def save(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def depths(stack):
    z, depth = {}, 0.
    for i, layer in enumerate(stack['copperLayers']):
        depth += layer['thicknessMm']/2
        z[layer['tscircuitLayer']] = depth
        depth += layer['thicknessMm']/2
        if i < len(stack['dielectrics']):
            depth += stack['dielectrics'][i]['thicknessMm']
    return z


def signal(raw, stacks):
    from cross_section import Section, analyze
    pci = module('pci_spacing', 'simulations/pcie-tx/check_asmedia_spacing.py')
    usb = module('usb_spacing', 'simulations/usb4/check_layout.py')
    clk = module('clock_spacing', 'simulations/bridge-clocks/check_layout.py')
    ctrl = module('control_impedance', 'simulations/control-routing/check_impedance.py')
    jobs = json.loads(subprocess.check_output([
        'bun', '-e', 'import {controlNets,controlProfiles} from "./lib/control-routing-config.mjs";'
        'console.log(JSON.stringify(controlNets.map(n=>({...n,rule:controlProfiles[n.profile]}))));'
    ], cwd=ROOT, text=True))
    cases = []
    for stack in stacks:
        print('Signal checks:', stack['code'], flush=True)
        p = stack['impedanceProfiles'][0]
        mask = stack['solderMaskModel']
        base = dict(height=stack['dielectrics'][0]['thicknessMm'],
                    er=stack['dielectrics'][0]['designDk'],
                    copper=p['calculatorGuideTraceModel']['outerCopperThicknessMm'],
                    top_width_reduction=p['calculatorGuideTraceModel']['topWidthReductionFromBaseMm'],
                    mask_er=mask['designDk'], mask_base=mask['aboveSubstrateMm'],
                    mask_top=mask['aboveTraceMm'])
        lines = {}
        for name, options in {
            'normal': dict(width=.1234, gap=.1001),
            'neckCoupled': dict(width=.0762, gap=.1001),
            'neckIsolated': dict(width=.0762, single=True),
        }.items():
            values = [analyze(Section(step=step, **base, **options)) for step in [.001, .0005]]
            if options.get('single'):
                for v in values:
                    v['uncoupledPairComparisonOhm'] = v['impedance_ohm']*2
            lines[name] = dict(results=values, meshChangeOhm=abs(values[0]['impedance_ohm']-values[1]['impedance_ohm']))
        cases.append(dict(code=stack['code'], lines=lines,
                          pcie=pci.audit(raw, stack=stack), usb=usb.audit(raw, stack=stack),
                          clocks=clk.audit(raw, stack=stack), controls=ctrl.audit(raw, jobs, stack)))
        save(OUT/'signal-progress.json', cases)
    return dict(cases=cases, limitations=[
        'Nominal two-dimensional uniform line calculations, with two mesh sizes. No fabrication tolerance sweep.',
        'Spacing checks retain the existing documented launch exclusions; pads, bends, signal vias, return vias, crosstalk and complete-channel loss require separate evaluation.',
        'Narrow-section impedances are uniform-line proxies, not the impedance of the actual finite BGA launch.',
    ])


def power(raw, stacks):
    import check_dc as core
    import check_slot_dc as slot
    import check_atx5v_dc as five
    import check_layout as layout
    import check_ground_returns as ground
    results = []
    for stack in stacks:
        for obj in [core, slot, five]:
            obj.STACK = stack
            obj.z = depths(stack)
        slot._MESH_CACHE.clear()
        rows = []
        for rail, amps in [('VCCL', 1.), ('VDD', 3.)]:
            core.CURRENT = amps
            print('Core DC:', stack['code'], rail, amps, flush=True)
            a, b = [core.solve(raw, rail, s) for s in [.15, .1]]
            upper = max(a['maximumDropMV'], b['maximumDropMV']) + max(
                abs(a['maximumDropMV']-b['maximumDropMV']), .2*b['maximumDropMV'])
            rows.append(dict(rail=rail, currentA=amps, coarse=a, fine=b, upperDropMV=upper,
                             stress3AUpperDropMV=upper*3/amps))
            save(OUT/'power-progress.json', dict(completed=results, currentCode=stack['code'], core=rows))
        slots = []
        for case in slot.CASES:
            print('Slot DC:', stack['code'], case[0], flush=True)
            a, b = [slot.solve(raw, case, s) for s in [.2, .12]]
            upper = max(a['dropMV'], b['dropMV']) + max(abs(a['dropMV']-b['dropMV']), .25*b['dropMV'])
            slots.append(dict(rail=case[0], currentA=case[3], coarse=a, fine=b, upperDropMV=upper))
            save(OUT/'power-progress.json', dict(completed=results, currentCode=stack['code'], core=rows, slot=slots))
        print('5 V input DC:', stack['code'], flush=True)
        a, b = [five.solve(raw, s) for s in [.2, .12]]
        inputs = {r: max(a['dropAtVinMV'][r], b['dropAtVinMV'][r]) + max(
            abs(a['dropAtVinMV'][r]-b['dropAtVinMV'][r]), .25*b['dropAtVinMV'][r]) for r in ['VCCL', 'VDD']}
        results.append(dict(code=stack['code'], layerDepthsMm=depths(stack), core=rows, slot=slots,
                            atx5V=dict(coarse=a, fine=b, currentPerBuckA=2, upperDropMV=inputs)))
        save(OUT/'power-progress.json', dict(completed=results))
    return dict(cases=results, geometry=layout.audit(raw), groundConnectivity=ground.audit(raw),
                copperTemperatureC=80, viaPlatingAssumedMm=core.PLATING,
                limitations=[
                    'Fixed-temperature DC conductor screen, not a thermal model. Copper temperature is assumed, not predicted.',
                    'Ground connectivity is checked; ground-return voltage loss is not included in these one-way supply drops.',
                    'Core rails use accepted planning loads (1 A VCCL, 3 A VDD) and equal current per bridge supply ball. 3 A stress values scale the linear resistance model.',
                    'The 8 mV core conductor budget is a project check, not the full ASMedia supply-voltage limit.',
                    'Slot paths use independent 5.5 A / 3 A rail envelopes, not simultaneous permission to exceed 75 W.',
                    'Slot results exclude MOSFET resistance, connector contact and cable loss. The existing slot solver includes physical circular connector plated-hole barrels.',
                    '5 V uses 2 A per buck (4 A total) as a conservative project conductor screen, not a measured input load.',
                    'Regulator accuracy, ripple, dynamic load steps, startup, current sharing and cooling are separate checks.',
                ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['signal', 'power'])
    parser.add_argument('--board', type=Path, default=OUT/'board.circuit.json')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    paths = [ROOT/'manufacturing/stackup/selected.json', ROOT/'manufacturing/stackup/JLC06161H-3313.json']
    stack_hash_before = sha(paths[0])
    stacks = [json.loads(p.read_text()) for p in paths]
    board = json.loads(args.board.read_text())
    raw = board['circuitJson'] if isinstance(board, dict) else board
    t = time.monotonic()
    result = (signal if args.mode == 'signal' else power)(raw, stacks)
    assert sha(paths[0]) == stack_hash_before, 'Selected production recipe changed during comparison'
    result.update(sourceFile=str(args.board.relative_to(ROOT)), sourceSha256=sha(args.board),
                  elapsedSeconds=time.monotonic()-t,
                  inputSha256={str(p.relative_to(ROOT)): sha(p) for p in paths+[Path(__file__)]},
                  productionRecipeChanged=False)
    save(OUT/(args.mode+'.json'), result)
    print(args.mode, 'comparison complete', flush=True)


if __name__ == '__main__':
    main()
