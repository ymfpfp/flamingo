"""Prepare fresh selected-stackup extraction jobs without running a solver."""
from pathlib import Path
from collections import Counter
import argparse
import copy
import datetime
import hashlib
import json
import os

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / 'dist/si-channel-review/selected-stackup-inputs'
DEFAULT_OUTPUT = ROOT / 'dist/si-channel-review/selected-stackup-channels'
SUITES = ('coarse', 'fine', 'crop', 'padding', 'vertical', 'mask')
MODES = ('d1', 'd2', 'c1', 'c2')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    os.replace(temporary, path)


def option(arguments, flag):
    return arguments[arguments.index(flag) + 1]


def set_option(arguments, flag, value):
    if flag in arguments:
        arguments[arguments.index(flag) + 1] = str(value)
    else:
        arguments.extend([flag, str(value)])


def validate_inputs(input_root):
    input_root = Path(input_root).resolve()
    validation = json.loads((input_root / 'validation.json').read_text())
    assert validation['passed'], 'Selected input validation did not pass'
    paths = {name: input_root / filename for name, filename in {
        'board': 'board.circuit.json', 'handoff': 'field-solver-handoff.json',
        'stackup': 'selected.json', 'plan': 'plan.json',
        'recipes': 'final-suite-recipes.json'}.items()}
    hashes = {name: sha(path) for name, path in paths.items()}
    for name, key in [('board', 'sourceSha256'), ('handoff', 'handoffSha256'),
                      ('stackup', 'selectedStackupSha256'), ('plan', 'planSha256')]:
        assert hashes[name] == validation[key], (name, 'Frozen input changed')
    handoff = json.loads(paths['handoff'].read_text())
    stackup = json.loads(paths['stackup'].read_text())
    plan = json.loads(paths['plan'].read_text())
    source = Path(handoff['sourceFile'])
    source = source if source.is_absolute() else ROOT / source
    assert sha(source) == handoff['sourceSha256'] == hashes['board']
    assert handoff['stackup'] == stackup, 'Handoff uses another stackup'
    assert plan['sourceSha256'] == hashes['board']
    assert plan['handoffSha256'] == hashes['handoff']
    assert len(plan['plans']) == 12 and all(p['supported'] for p in plan['plans'])
    assert validation['checks']['allAssembledComponentsTopLayer']
    return paths, hashes, handoff, stackup, plan


def prepare(input_root, output_root):
    input_root, output_root = Path(input_root).resolve(), Path(output_root).resolve()
    assert output_root != input_root and output_root != ROOT / 'dist/si-channel-review/refined-channels'
    assert not (output_root / 'superseded-by-screening.json').exists(), 'Exhaustive campaign is superseded by authorized screening'
    paths, hashes, handoff, stackup, plan = validate_inputs(input_root)
    if (output_root / 'jobs.json').exists():
        existing = json.loads((output_root / 'jobs.json').read_text())
        assert existing.get('sourceSha256') == hashes['board'], 'Existing campaign uses another board'
        assert existing.get('handoffSha256') == hashes['handoff'], 'Existing campaign uses another handoff'
        for job in existing['jobs']:
            status = Path(job['directory']) / 'status.json'
            if status.exists():
                assert json.loads(status.read_text()).get('state') == 'setup-only', 'Do not replace a started campaign'
    output_root.mkdir(parents=True, exist_ok=True)
    legacy_path = input_root / 'legacy-refined-plan.json'
    legacy = json.loads(legacy_path.read_text())
    old_plans = {p['channel']: p for p in legacy['plans']}
    via_ids = {e['pcb_via_id'] for e in handoff['boardContext'] if e['type'] == 'pcb_via'}
    carried, omitted = {}, {}
    plan = copy.deepcopy(plan)
    for p in plan['plans']:
        hints = old_plans.get(p['channel'], {}).get('extraMeshVias', [])
        p['extraMeshVias'] = sorted(set(hints) & via_ids)
        carried[p['channel']] = p['extraMeshVias']
        omitted[p['channel']] = sorted(set(hints) - via_ids)
        p['handoffSha256'] = hashes['handoff']
    for field in ['launchReady', 'launchBlocker']:
        plan.pop(field, None)
    plan.update({'selectedStackupSha256': hashes['stackup'],
                 'scope': 'Fresh nominal local PCB extraction on the frozen selected stackup; no numerical qualification yet.',
                 'meshHintPolicy': 'Retain legacy final mesh guards by via ID only when present in current frozen geometry.'})
    save(output_root / 'plan.json', plan)
    plan_sha = sha(output_root / 'plan.json')
    channel_plans = {}
    for fixture in plan['plans']:
        for suite in SUITES:
            channel_path = output_root / 'plans' / (fixture['channel'] + '-' + suite + '.json')
            save(channel_path, {**plan, 'plans': [fixture]})
            channel_plans[(fixture['channel'], suite)] = channel_path
    recipes = json.loads(paths['recipes'].read_text())['jobs']
    assert len(recipes) == 192
    jobs = []
    guards = {'sourceSha256': hashes['board'], 'handoffSha256': hashes['handoff'],
              'selectedStackupSha256': hashes['stackup']}
    for recipe in recipes:
        channel, suite, mode = (recipe[k] for k in ['channel', 'suite', 'mode'])
        assert suite in SUITES and mode in MODES
        arguments = list(recipe['argumentsExcludingPaths'])
        # Suite names select output directories only. Keep logical final names.
        set_option(arguments, '--suite', suite)
        assert float(option(arguments, '--resolution')) in [.025, .02]
        assert float(option(arguments, '--fixed-feed-gap-mm')) == .0497
        assert '--feature-mesh' in arguments
        added_resolve = '--resolve-lands' not in arguments
        if added_resolve:
            arguments.append('--resolve-lands')
        for flag, value in [('--handoff-file', paths['handoff']),
                            ('--plan-file', channel_plans[(channel, suite)]),
                            ('--output-root', output_root),
                            ('--steps', '300000'), ('--end-criteria', '1e-10')]:
            set_option(arguments, flag, value)
        resolution = float(option(arguments, '--resolution'))
        job = {'channel': channel, 'suite': suite, 'resolution': resolution,
               'mode': mode, 'driver': 'batch_em3d.py', 'arguments': arguments,
               'directory': str(output_root / suite / f'board-{channel}-{resolution:g}-3-{mode}'),
               'planSha256': sha(channel_plans[(channel, suite)]), **guards,
               'recipeSourceSha256': hashes['recipes'],
               'legacyResultsReused': False}
        if suite not in ['coarse', 'fine']:
            job['baselineSuite'] = 'fine' if channel == 'USB4_TX1' else 'coarse'
        if added_resolve:
            job['meshOnlyRecipeAdaptations'] = ['Enable common resolve-lands metal-edge rule.']
        jobs.append(job)
    counts = Counter(j['channel'] for j in jobs)
    assert len(counts) == 12 and set(counts.values()) == {16}
    assert len({(j['channel'], j['suite'], j['mode']) for j in jobs}) == 192
    # Independent channels stay ahead of the largest TX1 domain.
    order = ['PCIE_TX0', 'PCIE_TX1', 'PCIE_TX2', 'PCIE_TX3', 'PCIE_RX3',
             'USB4_TX2', 'USB4_RX1', 'USB4_RX2', 'PCIE_RX0', 'PCIE_RX1', 'PCIE_RX2', 'USB4_TX1']
    jobs.sort(key=lambda j: (SUITES.index(j['suite']), MODES.index(j['mode']), order.index(j['channel'])))
    controls = []
    for resolution, length, mode in [(.01, 3, 'd1'), (.005, 3, 'd1'), (.005, 1.5, 'd1'), (.01, 3, 'c1')]:
        arguments = ['--case', 'control', '--channel', 'USB4_RX2', '--resolution', str(resolution),
                     '--length', str(length), '--excitation', mode, '--graded-control', '--align-control-edges',
                     '--control-edge-thirds', '--robust-feed-posts', '--z-refinement', '2', '--steps', '600000',
                     '--end-criteria', '1e-10', '--fixed-feed-gap-mm', '.0497', '--control-height-mm', '.092',
                     '--handoff-file', str(paths['handoff']), '--plan-file', str(output_root / 'plan.json'),
                     '--output-root', str(output_root / 'controls')]
        controls.append({'channel': 'CALIBRATION', 'suite': 'controls', 'resolution': resolution,
                         'mode': mode, 'driver': 'em3d_line.py', 'arguments': arguments,
                         'directory': str(output_root / 'controls' / f'control-USB4_RX2-{resolution:g}-{length:g}-{mode}'),
                         'planSha256': plan_sha, **guards, 'legacyResultsReused': False})
    data = {'jobs': controls + jobs, 'coreJobs': 192, 'calibrationJobs': 4,
            'planSha256': plan_sha, **guards, 'inputRoot': str(input_root),
            'orderingNote': 'Fresh controls first, then final suites across independent channels; no prototype gate.',
            'allNativeJobsIndependent': True, 'oldNumericalResultsReused': False}
    save(output_root / 'jobs.json', data)
    provenance = {'createdUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'prepared': True, 'nativeRunsLaunched': 0, 'preflightRequired': True,
                  'numericallyQualified': False, 'inputRoot': str(input_root),
                  'inputs': {k: {'path': str(paths[k]), 'sha256': hashes[k]} for k in paths},
                  'validationSha256': sha(input_root / 'validation.json'),
                  'legacyHintPlanSha256': sha(legacy_path), 'carriedMeshHints': carried,
                  'omittedMissingViaHints': omitted, 'planSha256': plan_sha,
                  'jobsSha256': sha(output_root / 'jobs.json'),
                  'preparerSha256': sha(Path(__file__)), 'sourceGuards': guards,
                  'physicalBoardOrMaterialChanges': False, 'oldNumericalResultsReused': False,
                  'stackupCode': stackup['code'], 'coreJobs': 192, 'calibrationJobs': 4}
    save(output_root / 'preparation.json', provenance)
    print(json.dumps({'prepared': True, 'root': str(output_root), 'coreJobs': 192,
                      'calibrationJobs': 4, 'sourceSha256': hashes['board'], 'handoffSha256': hashes['handoff']}), flush=True)
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-root', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output-root', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    prepare(args.input_root, args.output_root)
