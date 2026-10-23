"""Run selected-stackup setup checks, with no native FDTD execution."""
from pathlib import Path
import argparse
import copy
import datetime
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

from prepare_selected_batch import (ROOT, DEFAULT_INPUT, DEFAULT_OUTPUT, SUITES,
                                    option, set_option, save, sha, validate_inputs)

SOURCES = ('batch_em3d.py', 'batch_geometry.py', 'em3d.py', 'em3d_line.py',
           'feature_mesh.py', 'fixed_feed.py')
CHANNEL_ORDER = ('PCIE_TX0', 'PCIE_TX1', 'PCIE_TX2', 'PCIE_TX3', 'PCIE_RX3',
                 'USB4_TX2', 'USB4_RX1', 'USB4_RX2', 'PCIE_RX0', 'PCIE_RX1', 'PCIE_RX2', 'USB4_TX1')


def physical_hash(directory):
    root = ET.parse(Path(directory) / 'model.xml').getroot().find('ContinuousStructure')
    root.remove(root.find('RectilinearGrid'))
    properties = root.find('Properties')
    for element in list(properties):
        if element.tag in ['Excitation', 'ProbeBox']:
            properties.remove(element)
    for element in root.iter():
        element.attrib.pop('ID', None)
        for child in list(element):
            if child.tag in ['FillColor', 'EdgeColor']:
                element.remove(child)
    return hashlib.sha256(ET.tostring(root)).hexdigest()


def source_hashes():
    return {name: sha(ROOT / 'simulations/channel-si' / name) for name in SOURCES}


def signature(job):
    return hashlib.sha256(json.dumps({'arguments': job['arguments'],
        'planSha256': sha(option(job['arguments'], '--plan-file')),
        'sources': source_hashes()}, sort_keys=True).encode()).hexdigest()


def guarded_bounds(plan, arguments, board):
    margin, padding = float(option(arguments, '--crop-margin')), float(option(arguments, '--padding'))
    bounds = [plan['boundsMm'][0] - margin, plan['boundsMm'][1] - margin,
              plan['boundsMm'][2] + margin, plan['boundsMm'][3] + margin]
    x, y = board['center']['x'], board['center']['y']
    physical = [x - board['width'] / 2, y - board['height'] / 2,
                x + board['width'] / 2, y + board['height'] / 2]
    for axis in [0, 1]:
        if bounds[axis] - max(padding, 2.5) < physical[axis] < bounds[axis]:
            bounds[axis] = physical[axis] - .4
        if bounds[axis + 2] < physical[axis + 2] < bounds[axis + 2] + max(padding, 2.5):
            bounds[axis + 2] = physical[axis + 2] + .4
    return bounds


def adapt(root, manifest, job, error, handoff):
    """Only add sampling hints or extend unchanged crop cross sections into PML."""
    arguments = job['arguments']
    plan_path = Path(option(arguments, '--plan-file'))
    plan = json.loads(plan_path.read_text())
    fixture = next(p for p in plan['plans'] if p['channel'] == job['channel'])
    ids = set(re.findall(r'pcb_via_\d+', error.splitlines()[-1] if error.splitlines() else error))
    if 'Via barrel under-sampled' in error and ids:
        known = {v['pcb_via_id'] for v in handoff['boardContext'] if v['type'] == 'pcb_via'}
        assert ids <= known, ('Unknown via sampling hint', ids - known)
        before = copy.deepcopy(plan)
        affected = [j for j in manifest['jobs'] if j['channel'] == job['channel'] and j['suite'] == job['suite']]
        previous = set(fixture.get('extraMeshVias', []))
        if ids <= previous:
            return None
        fixture['extraMeshVias'] = sorted(previous | ids)
        # Hints must leave every physical plan field byte-for-byte unchanged.
        proof = copy.deepcopy(plan)
        for item in proof['plans']:
            original = next(p for p in before['plans'] if p['channel'] == item['channel'])
            item['extraMeshVias'] = original.get('extraMeshVias', [])
        assert proof == before, 'Sampling repair changed physical fixture data'
        save(plan_path, plan)
        for item in affected:
            set_option(item['arguments'], '--plan-file', plan_path)
            item['planSha256'] = sha(plan_path)
        record = {'kind': 'sampling-hint', 'channel': job['channel'], 'suite': job['suite'],
                  'addedViaIDs': sorted(ids - previous), 'planFile': str(plan_path),
                  'allPhysicalPlanFieldsUnchanged': True, 'sourceAndHandoffUnchanged': True}
    elif 'Material changes within PML' in error:
        before = list(arguments)
        padding = float(option(arguments, '--padding'))
        if padding >= 4.5:
            return None
        revised = list(arguments)
        set_option(revised, '--padding', min(4.5, padding + 1.0))
        board = next(v for v in handoff['boardContext'] if v['type'] == 'pcb_board')
        original_bounds = guarded_bounds(fixture, before, board)
        assert guarded_bounds(fixture, revised, board) == original_bounds, 'PML padding would change crop bounds'
        for item in manifest['jobs']:
            if item['channel'] == job['channel'] and item['suite'] == job['suite']:
                set_option(item['arguments'], '--padding', option(revised, '--padding'))
        record = {'kind': 'PML-padding', 'channel': job['channel'], 'suite': job['suite'],
                  'beforeMm': padding, 'afterMm': float(option(revised, '--padding')),
                  'physicalCropBoundsUnchanged': True, 'boundsMm': original_bounds,
                  'physicalCopperAndMaterialsUnchangedInsideCrop': True}
    else:
        return None
    manifest.setdefault('preflightAdaptations', []).append(record)
    save(root / 'jobs.json', manifest)
    return record


def main(args):
    root = args.output_root.resolve()
    assert not (root / 'superseded-by-screening.json').exists(), 'Exhaustive campaign is superseded by authorized screening'
    _, guards, handoff, _, _ = validate_inputs(args.input_root)
    manifest = json.loads((root / 'jobs.json').read_text())
    assert manifest['sourceSha256'] == guards['board'] and manifest['handoffSha256'] == guards['handoff']
    assert manifest['coreJobs'] == 192
    prior = json.loads((root / 'preflight.json').read_text()) if (root / 'preflight.json').exists() else {}
    cases = {(c['channel'], c['suite']): c for c in prior.get('cases', [])}
    control_cases = {c['directory']: c for c in prior.get('controlCases', [])}
    requested = set(args.channels.split(',')) if args.channels else set(CHANNEL_ORDER)
    first_ready = set(prior.get('launchReadyChannels', []))
    log_root = root / 'preflight-logs'
    log_root.mkdir(exist_ok=True)

    def report(active=None):
        ready = []
        for channel in CHANNEL_ORDER:
            rows = [cases.get((channel, suite)) for suite in SUITES]
            if all(row and row['returncode'] == 0 for row in rows):
                if rows[0].get('physicalGeometrySha256') == rows[1].get('physicalGeometrySha256'):
                    ready.append(channel)
        core_cases = [c for c in cases.values() if c['channel'] != 'CALIBRATION']
        controls_passed = len(control_cases) == 4 and all(c['returncode'] == 0 for c in control_cases.values())
        if controls_passed:
            control_job = next(j for j in manifest['jobs'] if j['channel'] == 'CALIBRATION')
            cases[('CALIBRATION', 'controls')] = {'channel': 'CALIBRATION', 'suite': 'controls',
                'returncode': 0, 'planSha256': control_job['planSha256'], 'allFourControlRecipesReady': True,
                'meshCells': max(c['meshCells'] for c in control_cases.values()),
                'sourceSha256': guards['board'], 'handoffSha256': guards['handoff']}
        else:
            cases.pop(('CALIBRATION', 'controls'), None)
        data = {'updatedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'expectedGeometryCases': 72, 'completedGeometryCases': len(core_cases),
                'passedGeometryCases': sum(c['returncode'] == 0 for c in core_cases),
                'failedGeometryCases': sum(c['returncode'] != 0 for c in core_cases),
                'expectedControlCases': 4, 'passedControlCases': sum(c['returncode'] == 0 for c in control_cases.values()),
                'controlsReady': controls_passed,
                'passed': len(core_cases) == 72 and all(c['returncode'] == 0 for c in core_cases) and len(ready) == 12 and controls_passed,
                'launchReadyChannels': ready, 'active': active, 'cases': list(cases.values()),
                'controlCases': list(control_cases.values()),
                'nativeRunsLaunched': 0, 'numericallyQualified': False,
                'sourceSha256': guards['board'], 'handoffSha256': guards['handoff'],
                'selectedStackupSha256': guards['stackup'], 'jobsSha256': sha(root / 'jobs.json')}
        save(root / 'preflight.json', data)
        return data

    for job in [j for j in manifest['jobs'] if j['channel'] == 'CALIBRATION']:
        current_signature = signature(job)
        previous = control_cases.get(job['directory'])
        if previous and previous.get('signature') == current_signature and previous['returncode'] == 0:
            continue
        report({'channel': 'CALIBRATION', 'suite': 'controls', 'directory': job['directory']})
        arguments = list(job['arguments'])
        set_option(arguments, '--output-root', root / 'preflight-controls')
        started = time.monotonic()
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'simulations/channel-si/em3d_line.py'),
                                 *arguments, '--setup-only'], cwd=ROOT, text=True, capture_output=True,
                                env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
        directory = root / 'preflight-controls' / Path(job['directory']).name
        log_path = log_root / (Path(job['directory']).name + '.log')
        log_path.write_text(result.stdout + result.stderr)
        row = {'channel': 'CALIBRATION', 'suite': 'controls', 'directory': job['directory'],
               'preflightDirectory': str(directory), 'returncode': result.returncode,
               'durationSeconds': round(time.monotonic() - started, 2), 'signature': current_signature,
               'planSha256': job['planSha256'], 'error': result.stderr[-2200:], 'log': str(log_path)}
        if result.returncode == 0:
            setup = json.loads((directory / 'setup.json').read_text())
            assert setup['sourceSha256'] == guards['board'] and setup['handoffSha256'] == guards['handoff']
            row.update({'meshLines': setup['meshLines'], 'meshCells': math.prod(n - 1 for n in setup['meshLines'].values())})
        control_cases[job['directory']] = row
        report()
        print(json.dumps({k: row[k] for k in ['channel', 'suite', 'directory', 'returncode', 'durationSeconds']}
                         | ({'error': row['error'].splitlines()[-1]} if row['error'] and result.returncode else {})), flush=True)

    for channel in CHANNEL_ORDER:
        if channel not in requested:
            continue
        for round_number in range(8):
            changed = False
            for suite in SUITES:
                job = next(j for j in manifest['jobs'] if j['channel'] == channel and j['suite'] == suite
                           and j['mode'] == ('d1' if suite in ['coarse', 'fine'] else 'd2'))
                current_signature = signature(job)
                previous = cases.get((channel, suite))
                if previous and previous.get('signature') == current_signature and previous['returncode'] == 0:
                    continue
                validate_inputs(args.input_root)
                assert sha(option(job['arguments'], '--plan-file')) == job['planSha256']
                report({'channel': channel, 'suite': suite, 'round': round_number + 1})
                command_arguments = list(job['arguments'])
                set_option(command_arguments, '--suite', 'preflight-' + suite)
                command = [sys.executable, '-B', str(ROOT / 'simulations/channel-si/batch_em3d.py'),
                           *command_arguments, '--setup-only']
                started = time.monotonic()
                result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True,
                                        env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
                log_path = log_root / f'{channel}-{suite}-round-{round_number + 1}.log'
                log_path.write_text(result.stdout + result.stderr)
                directory = root / ('preflight-' + suite) / Path(job['directory']).name
                row = {'channel': channel, 'suite': suite, 'mode': job['mode'], 'directory': str(directory),
                       'returncode': result.returncode, 'durationSeconds': round(time.monotonic() - started, 2),
                       'planSha256': job['planSha256'],
                       'signature': current_signature, 'log': str(log_path), 'error': result.stderr[-2200:],
                       'sourceSha256': guards['board'], 'handoffSha256': guards['handoff'],
                       'solverSourcesSha256': source_hashes()}
                if result.returncode == 0:
                    setup = json.loads((directory / 'setup.json').read_text())
                    assert setup['sourceSha256'] == guards['board'] and setup['handoffSha256'] == guards['handoff']
                    assert all(check['passed'] for check in setup['pmlMaterialChecks'])
                    row.update({'meshLines': setup['meshLines'], 'viaCount': setup['viaCount'],
                                'meshCells': math.prod(n - 1 for n in setup['meshLines'].values()),
                                'physicalGeometrySha256': physical_hash(directory),
                                'setupSha256': sha(directory / 'setup.json'), 'modelSha256': sha(directory / 'model.xml')})
                cases[(channel, suite)] = row
                print(json.dumps({k: row[k] for k in ['channel', 'suite', 'returncode', 'durationSeconds']}
                                 | ({'error': row['error'].splitlines()[-1]} if row['error'] and result.returncode else {})), flush=True)
                if result.returncode:
                    repair = adapt(root, manifest, job, result.stderr, handoff)
                    if repair:
                        changed = True
                        print(json.dumps({'adaptation': repair}), flush=True)
                state = report()
                if channel in state['launchReadyChannels'] and channel not in first_ready:
                    first_ready.add(channel)
                    print(json.dumps({'event': 'channel-launch-ready', 'channel': channel,
                                      'geometryCasesPassed': 6, 'nativeRunsLaunched': 0}), flush=True)
            # A hint can change a preceding suite. Repeat only this channel.
            stale_case = any(cases.get((channel, suite), {}).get('signature') != signature(next(
                j for j in manifest['jobs'] if j['channel'] == channel and j['suite'] == suite
                and j['mode'] == ('d1' if suite in ['coarse', 'fine'] else 'd2'))) for suite in SUITES)
            if not changed and not stale_case:
                break
        state = report()
        if channel not in state['launchReadyChannels']:
            print(json.dumps({'event': 'channel-preflight-needs-review', 'channel': channel}), flush=True)
    state = report()
    print(json.dumps({k: state[k] for k in ['passed', 'passedGeometryCases', 'failedGeometryCases', 'launchReadyChannels']}), flush=True)
    return 0 if state['passed'] or (args.channels and all(c in state['launchReadyChannels'] for c in requested)) else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-root', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output-root', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--channels')
    sys.exit(main(parser.parse_args()))
