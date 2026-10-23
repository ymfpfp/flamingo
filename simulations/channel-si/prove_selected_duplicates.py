"""Reduce only exact selected-stackup model duplicates; never run FDTD."""
from pathlib import Path
import argparse
import ast
import copy
import datetime
import hashlib
import importlib.metadata
import importlib
import json
import sys

import numpy as np
import batch_em3d
from prepare_selected_batch import ROOT, save, sha

CAMPAIGN = ROOT / 'dist/si-channel-review/selected-stackup-channels'
OUT = ROOT / 'dist/si-channel-review/fast-screening'
VERIFIED_SUITES = ('coarse', 'fine', 'padding', 'vertical', 'mask')
SOURCE_NAMES = ('batch_em3d.py', 'batch_geometry.py', 'em3d.py', 'em3d_line.py', 'feature_mesh.py', 'fixed_feed.py')


def plain(value):
    if isinstance(value, np.ndarray):
        return plain(value.tolist())
    if isinstance(value, np.generic):
        return plain(value.item())
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [plain(v) for v in value]
    if isinstance(value, float):
        if not np.isfinite(value):
            # Native optional fields use NaN/Inf sentinels for unset values.
            return {'nativeDefaultFloatSentinel': value.hex()}
        return 0.0 if value == 0 else value
    assert value is None or isinstance(value, (str, int, bool)), type(value)
    return value


def constructor():
    """Execute the actual production constructor up to its first output write."""
    tree = ast.parse(Path(batch_em3d.__file__).read_text())
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'run')
    kept = []
    for statement in function.body:
        if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'driver' for t in statement.targets):
            break
        if (isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call)
                and isinstance(statement.value.func, ast.Attribute) and statement.value.func.attr == 'mkdir'):
            continue
        kept.append(statement)
    assert kept and not any(isinstance(n, ast.Attribute) and n.attr in ['Run', 'Write2XML', 'write_text', 'write_bytes']
                            for statement in kept for n in ast.walk(statement))
    function.name = 'construct_model_in_memory'
    function.body = kept + ast.parse('return locals()').body
    module = ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[]))
    namespace = dict(batch_em3d.__dict__)
    exec(compile(module, '<actual-selected-model-construction-no-output-or-solve>', 'exec'), namespace)
    digest = hashlib.sha256(ast.dump(module, include_attributes=False).encode()).hexdigest()
    return namespace[function.name], digest


def job_args(job):
    arguments, values, index = job['arguments'], {}, 0
    while index < len(arguments):
        key = arguments[index][2:].replace('-', '_')
        index += 1
        if index < len(arguments) and not arguments[index].startswith('--'):
            values[key] = arguments[index]
            index += 1
        else:
            values[key] = True
    for key in ['resolution', 'fixed_feed_gap_mm', 'barrel_step_mm', 'crop_margin',
                'z_refinement', 'padding', 'air_height', 'end_criteria']:
        values[key] = float(values[key])
    values['steps'] = int(values['steps'])
    values.setdefault('open_pads', False)
    values.update({'setup_only': True, 'cpu_threads': 8})
    return argparse.Namespace(**values)


def property_state(prop):
    kind = prop.GetTypeString()
    state = {'type': kind, 'name': prop.GetName(), 'attributes': prop.GetAttributes(),
             'coordinateInputType': prop.GetCoordInputType(), 'materialFlag': prop.GetMaterial()}
    if kind == 'Material':
        state['isotropy'] = prop.GetIsotropy()
        state['materialValues'] = {k: prop.GetMaterialProperty(k) for k in ['epsilon', 'mue', 'kappa', 'sigma', 'density']}
        state['materialWeights'] = {k: prop.GetMaterialWeight(k) for k in ['epsilon', 'mue', 'kappa', 'sigma', 'density']}
    elif kind == 'LumpedElement':
        for name in ['GetCapacity', 'GetCaps', 'GetDirection', 'GetInductance', 'GetLEtype', 'GetResistance']:
            state[name] = getattr(prop, name)()
    elif kind == 'Excitation':
        for name in ['GetDelay', 'GetEnabled', 'GetExcitType', 'GetExcitation', 'GetFrequency',
                     'GetPropagationDir', 'GetWeightFile', 'GetWeightOrigin']:
            state[name] = getattr(prop, name)()
        state['weightFunctions'] = prop.GetWeightFunction()
    elif kind == 'ProbeBox':
        for name in ['GetModeFile', 'GetModeOrigin', 'GetNormalDir', 'GetOverSampling',
                     'GetProbeType', 'GetWeighting', 'GetFrequencyCount']:
            state[name] = getattr(prop, name)()
        state['frequencies'] = prop.GetFrequency()
        state['modeFunctions'] = prop.GetModeFunction()
    else:
        assert kind == 'Metal', ('Uncovered physical property type', kind)
    return plain(state)


def descriptor(model, dy, sources):
    csx, mesh, args = model['csx'], model['mesh'], model['args']
    properties = csx.GetAllProperties()
    property_indices = {p.GetID(): i for i, p in enumerate(properties)}
    primitives = csx.GetAllPrimitives()
    primitive_indices = {p.GetID(): i for i, p in enumerate(primitives)}
    minimum_id = min(primitive_indices)
    ordered_properties = []
    for prop in properties:
        state = property_state(prop)
        state['primitiveOrder'] = [primitive_indices[p.GetID()] for p in prop.GetAllPrimitives()]
        ordered_properties.append(state)
    ordered_primitives = []
    for primitive in primitives:
        kind = primitive.GetTypeName()
        assert not primitive.GetTransform().HasTransform(), 'Uncovered primitive transform'
        state = {'type': kind, 'priority': primitive.GetPriority(),
                 'relativeNativeID': primitive.GetID() - minimum_id,
                 'propertyIndex': property_indices[primitive.GetProperty().GetID()],
                 'coordinateSystem': primitive.GetCoordinateSystem(),
                 'transform': primitive.GetTransform().GetMatrix()}
        if kind == 'LinPoly':
            assert primitive.GetNormDir() == 2
            coords = np.array(primitive.GetCoords(), copy=True)
            coords[1] += dy
            state.update({'coordinates': coords, 'normDir': 2, 'elevation': primitive.GetElevation(),
                          'length': primitive.GetLength(), 'quantity': primitive.GetQtyCoords()})
        elif kind in ['Box', 'Cylinder', 'CylindricalShell']:
            for name in ['Start', 'Stop']:
                point = np.array(getattr(primitive, 'Get' + name)(), copy=True)
                point[1] += dy
                state[name] = point
            if kind != 'Box':
                state['radius'] = primitive.GetRadius()
            if kind == 'CylindricalShell':
                state['shellWidth'] = primitive.GetShellWidth()
        else:
            raise AssertionError(('Uncovered primitive type', kind))
        ordered_primitives.append(plain(state))
    ports, gaps, measurements = copy.deepcopy(model['ports']), copy.deepcopy(model['gaps']), copy.deepcopy(model['measurements'])
    for port in ports:
        for field in ['xy', 'feedXY']:
            port[field][1] += dy
        # Upstream route arc length and segment ordinal do not enter the local solver.
        port.pop('arcMm', None)
        port.pop('segmentIndex', None)
    for gap in gaps:
        gap['start'][1] += dy
        gap['stop'][1] += dy
    for measurement in measurements:
        measurement['reference'][1] += dy
    bounds = list(model['meta']['boundsMm'])
    bounds[1] += dy
    bounds[3] += dy
    background = csx.GetBackgroundMaterial()
    background_state = {}
    for name in dir(background):
        if name.startswith('Get'):
            background_state[name] = plain(getattr(background, name)())
    grids = {axis: np.array(mesh.GetLines(axis, do_sort=True), copy=True) for axis in ['x', 'y', 'z']}
    grids['y'] += dy
    result = {'orderedProperties': ordered_properties, 'orderedPrimitives': ordered_primitives,
              'grid': grids, 'deltaUnit': mesh.GetDeltaUnit(), 'gridType': mesh.GetMeshType(),
              'drawingTolerance': csx.GetDrawingTolerance(), 'coordinateInputType': csx.GetCoordInputType(),
              'background': background_state, 'ports': ports, 'terminalGaps': gaps, 'lineMeasurement': measurements,
              'cropBoundsMm': bounds, 'layerZMm': model['meta']['layerZMm'],
              'fdtd': {'maximumTimeSteps': args.steps, 'endCriteria': args.end_criteria,
                       'timeStepFactor': .8, 'gaussianF0Hz': 8e9, 'gaussianFCHz': 8e9,
                       'boundaryConditions': ['PML_8'] * 6},
              'sourceSha256': sources}
    return plain(result)


def residual(a, b, path=''):
    errors, maximum, count = [], 0.0, 0
    if isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b):
            return [{'path': path, 'reason': 'Different keys'}], 0.0, 0
        for key in a:
            difference, value, numbers = residual(a[key], b[key], path + '/' + key)
            errors.extend(difference[:max(0, 12 - len(errors))])
            maximum, count = max(maximum, value), count + numbers
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [{'path': path, 'reason': 'Different lengths', 'before': len(a), 'after': len(b)}], 0.0, 0
        for index, (left, right) in enumerate(zip(a, b)):
            difference, value, numbers = residual(left, right, path + '/' + str(index))
            errors.extend(difference[:max(0, 12 - len(errors))])
            maximum, count = max(maximum, value), count + numbers
    elif isinstance(a, (float, int)) and isinstance(b, (float, int)):
        count = 1
        maximum = abs(a - b)
        if maximum != 0:
            errors = [{'path': path, 'left': a, 'right': b, 'absoluteResidual': maximum}]
    elif a != b:
        errors = [{'path': path, 'left': a, 'right': b}]
    return errors, maximum, count


def job_id(job):
    if job['channel'] == 'CALIBRATION':
        return 'CALIBRATION/' + Path(job['directory']).name
    return '/'.join(job[k] for k in ['channel', 'suite', 'mode'])


def main(reuse_descriptors=False, quiet=False):
    manifest_path = CAMPAIGN / 'exhaustive-jobs.json'
    manifest = json.loads(manifest_path.read_text())
    assert manifest['coreJobs'] == 192 and len(manifest['jobs']) == 196
    assert (CAMPAIGN / 'superseded-by-screening.json').exists()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'model-evidence').mkdir(exist_ok=True)
    construct, constructor_sha = constructor()
    sources = {name: sha(ROOT / 'simulations/channel-si' / name) for name in SOURCE_NAMES}
    sources['copper_geometry.py'] = sha(ROOT / 'simulations/pcie-tx/copper_geometry.py')
    previous = json.loads((OUT / 'duplicate-cases.json').read_text()) if reuse_descriptors else None
    if previous:
        assert previous['sourceCodeSha256'] == sources and previous['constructorASTSha256'] == constructor_sha
        assert previous['exhaustiveManifestSha256'] == sha(manifest_path)
    native_libraries = {}
    for name in ['CSXCAD.CSXCAD', 'CSXCAD.CSPrimitives', 'CSXCAD.CSProperties', 'openEMS.openEMS', 'shapely.lib']:
        module = importlib.import_module(name)
        native_libraries[name] = {'path': module.__file__, 'sha256': sha(module.__file__)}
    selected = [j for j in manifest['jobs'] if j['channel'] in ['PCIE_TX1', 'PCIE_TX2', 'PCIE_TX3']
                and j['suite'] in VERIFIED_SUITES]
    assert len(selected) == 42
    groups, aliases, comparisons, models = {}, [], [], {}
    proof = {'updatedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'complete': False, 'scope': 'Selected-stackup local-model screening reuse only.',
             'sourceSha256': manifest['sourceSha256'], 'handoffSha256': manifest['handoffSha256'],
             'selectedStackupSha256': manifest['selectedStackupSha256'],
             'nativeFDTDRunsLaunched': 0, 'aliasesAreIndependentSimulations': False,
             'nativeDataCopiedOrSymlinkedToAliases': False,
             'criterion': 'Exact equality of every captured full-precision numeric value and ordered nonnumeric state. Zero tolerance.',
             'primitiveAndPropertyOrderPreserved': True, 'priorityTieOrderPreserved': True,
             'modelDescriptorComparisonFrame': {'referenceChannel': 'PCIE_TX1',
                 'convention': 'Each descriptor adds its transformToCommonComparisonFrameMm to its original absolute coordinates. Alias-to-canonical transforms are separate.'},
             'polygonVertexOrderPreserved': True, 'sourceCodeSha256': sources,
             'constructorASTSha256': constructor_sha, 'proofScriptSha256': sha(Path(__file__)),
             'nativeLibraries': native_libraries, 'numpyVersion': np.__version__,
             'exhaustiveManifest': str(manifest_path), 'exhaustiveManifestSha256': sha(manifest_path),
             'aliases': aliases, 'comparisons': comparisons,
             'limitations': ['No bitwise native coefficient-array equality claim. The native operator is not built during this proof.',
                            'No full-channel length, loss, eye, BER or compliance equivalence claim.',
                            'Alias descriptors are reconstructed model evidence, not copied solver output or independent simulations.',
                            'Changes to frozen inputs, source code, solver libraries, grid, primitives, ordering or excitation invalidate this proof.']}
    for job in selected:
        identifier = job_id(job)
        lane = job['channel']
        dy = {'PCIE_TX1': 0.0, 'PCIE_TX2': 4.0, 'PCIE_TX3': 8.0}[lane]
        model_path = OUT / 'model-evidence' / (identifier.replace('/', '__') + '.model.json')
        if previous:
            cached = next(m for m in previous['models'] if m['jobId'] == identifier)
            assert cached['planSha256'] == job['planSha256']
            assert sha(model_path) == cached['modelDescriptorSha256']
            state = json.loads(model_path.read_text())
        else:
            model = construct(job_args(job))
            assert model['meta']['sourceSha256'] == manifest['sourceSha256']
            assert model['meta']['handoffSha256'] == manifest['handoffSha256']
            state = descriptor(model, dy, sources)
            save(model_path, state)
            del model
        record = {'jobId': identifier, 'modelDescriptor': str(model_path), 'modelDescriptorSha256': sha(model_path),
                  'planFile': job['arguments'][job['arguments'].index('--plan-file') + 1],
                  'planSha256': job['planSha256'], 'transformToCommonComparisonFrameMm': [0.0, dy, 0.0],
                  'commonComparisonFrameReferenceChannel': 'PCIE_TX1',
                  'primitiveCount': len(state['orderedPrimitives']), 'propertyCount': len(state['orderedProperties'])}
        models[identifier] = record
        key = (job['suite'], job['mode'])
        if lane == 'PCIE_TX1':
            groups[key] = (identifier, state)
        else:
            canonical_id, canonical_state = groups[key]
            differences, maximum, numbers = residual(canonical_state, state)
            exact = not differences and maximum == 0.0
            comparison = {'canonicalJobId': canonical_id, 'candidateJobId': identifier,
                          'transformAliasToCanonicalMm': [0.0, dy, 0.0], 'exact': exact,
                          'maximumNumericResidual': maximum, 'numericValuesCompared': numbers,
                          'firstDifferences': differences, 'geometryMaterialPortProbeGridSourceLoadPMLCompared': True,
                          'primitivePropertyAndTieOrderPreserved': True}
            comparisons.append(comparison)
            if exact:
                aliases.append({'aliasJobId': identifier, 'canonicalJobId': canonical_id,
                                'transformAliasToCanonicalMm': [0.0, dy, 0.0],
                                'maximumNumericResidual': 0.0, 'independentlySimulated': False,
                                'nativeDataLocation': None, 'evidence': record})
            if not quiet:
                print(json.dumps({'canonical': canonical_id, 'candidate': identifier, 'exact': exact,
                                  'maximumNumericResidual': maximum, 'firstDifferences': differences[:1]}), flush=True)
            proof['models'] = list(models.values())
            save(OUT / 'duplicate-cases.json', proof)
    # TX1 is not assumed to be representative. Test the remaining direct pair.
    for canonical_id in [m for m in models if m.startswith('PCIE_TX2/')]:
        candidate_id = canonical_id.replace('PCIE_TX2/', 'PCIE_TX3/', 1)
        if any(a['aliasJobId'] == candidate_id for a in aliases):
            continue
        canonical_state = json.loads(Path(models[canonical_id]['modelDescriptor']).read_text())
        candidate_state = json.loads(Path(models[candidate_id]['modelDescriptor']).read_text())
        differences, maximum, numbers = residual(canonical_state, candidate_state)
        exact = not differences and maximum == 0.0
        comparison = {'canonicalJobId': canonical_id, 'candidateJobId': candidate_id,
                      'transformAliasToCanonicalMm': [0.0, 4.0, 0.0], 'exact': exact,
                      'maximumNumericResidual': maximum, 'numericValuesCompared': numbers,
                      'firstDifferences': differences, 'geometryMaterialPortProbeGridSourceLoadPMLCompared': True,
                      'primitivePropertyAndTieOrderPreserved': True,
                      'comparisonFrame': 'Both descriptors translated exactly into the PCIE_TX1 coordinate frame.'}
        comparisons.append(comparison)
        if exact:
            aliases.append({'aliasJobId': candidate_id, 'canonicalJobId': canonical_id,
                            'transformAliasToCanonicalMm': [0.0, 4.0, 0.0], 'maximumNumericResidual': 0.0,
                            'independentlySimulated': False, 'nativeDataLocation': None,
                            'evidence': models[candidate_id]})
        if not quiet:
            print(json.dumps({'canonical': canonical_id, 'candidate': candidate_id, 'exact': exact,
                              'maximumNumericResidual': maximum, 'firstDifferences': differences[:1]}), flush=True)
    alias_ids = {a['aliasJobId'] for a in aliases}
    retained = [j for j in manifest['jobs'] if job_id(j) not in alias_ids]
    for job in retained:
        job['jobId'] = job_id(job)
    excluded = [j for j in manifest['jobs'] if j['channel'].startswith('PCIE_TX')
                and (j['channel'] == 'PCIE_TX0' or j['suite'] == 'crop')]
    proof.update({'complete': True, 'updatedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'models': list(models.values()), 'candidateComparisons': len(comparisons), 'removedDuplicateJobs': len(aliases),
                  'nonExactCandidatesRetained': sorted({c['candidateJobId'] for c in comparisons if not c['exact']} - alias_ids),
                  'concreteTX1Difference': {'extraNeighborViaId': 'pcb_via_13', 'centerMm': [2.5, 95.5],
                      'drillDiameterMm': .3, 'copperDiameterMm': .6,
                      'coarsePrimitiveCounts': {'PCIE_TX1': 116, 'PCIE_TX2': 109, 'PCIE_TX3': 109},
                      'coarseCopperPrimitiveCounts': {'PCIE_TX1': 32, 'PCIE_TX2': 27, 'PCIE_TX3': 27}},
                  'wholeChannelRoutingLengthChecksDeduplicated': False,
                  'wholeChannelRoutingLengthEvidence': str(ROOT / 'dist/si-channel-review/selected-stackup-inputs/field-solver-handoff.json'),
                  'excludedCasesRetained': [{'jobId': job_id(j), 'reason': 'TX0 and expanded crops remain independent; outside the exact verified group.'} for j in excluded]})
    save(OUT / 'duplicate-cases.json', proof)
    # This list removes actual alias rows. The original manifest remains intact.
    risk_jobs = [j for j in retained if j['channel'] == 'CALIBRATION' or j['suite'] == 'coarse'
                 or (j['channel'] in ['USB4_TX1', 'PCIE_TX1'] and j['suite'] == 'fine')
                 or (j['channel'] == 'USB4_TX1' and j['suite'] in ['crop', 'padding', 'vertical', 'mask'])]
    reduced = {**manifest, 'jobs': retained, 'coreJobs': sum(j['channel'] != 'CALIBRATION' for j in retained),
               'calibrationJobs': sum(j['channel'] == 'CALIBRATION' for j in retained),
               'purpose': 'Unique canonical native screening candidates, aliases excluded.',
               'nativeLaunchAuthorizedByThisFile': False, 'nativeRunsLaunched': 0,
               'counts': {'beforeCore': 192, 'beforeControls': 4, 'beforeTotal': 196,
                          'removedExactDuplicateCoreJobs': len(aliases), 'afterCore': len(retained) - 4,
                          'afterControls': 4, 'afterTotal': len(retained)},
               'aliasesExcluded': aliases, 'proofFile': str(OUT / 'duplicate-cases.json'),
               'proofFileSha256': sha(OUT / 'duplicate-cases.json'),
               'riskFocusedProposal': {'coreJobs': sum(j['channel'] != 'CALIBRATION' for j in risk_jobs),
                   'calibrationJobs': 4, 'totalJobs': len(risk_jobs), 'jobIds': [job_id(j) for j in risk_jobs],
                   'rationale': 'All unique coarse matrices, fine USB4_TX1 and representative PCIe TX transition, plus TX1 domain/vertical/mask studies.',
                   'scope': 'Risk screening only. Omitted sensitivity studies remain incomplete and no full extraction-clearance claim follows.'}}
    save(OUT / 'reduced-native-candidates.json', reduced)
    print(json.dumps({'complete': True, 'exactDuplicatesRemoved': len(aliases), 'uniqueCoreCandidates': len(retained) - 4,
                      'uniqueTotalCandidates': len(retained), 'riskFocusedNativeProposal': len(risk_jobs)}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--reuse-descriptors', action='store_true', help='Recompare hash-guarded fresh in-memory descriptors without rebuilding models.')
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()
    main(args.reuse_descriptors, args.quiet)
