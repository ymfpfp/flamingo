"""Audit corrected native evidence, physical fixtures and four-port exports."""
from pathlib import Path
from urllib.parse import urlparse,unquote
import ast,hashlib,json,time
import numpy as np
from audit_channel_batch import Links,sha
from analyze_channel_batch import hashes,functional_model_hash
from analyze_extraction import read_case,waves
from audit_feed_fixtures import inspect as inspect_feed
from analyze_refined_channels import physical_hash
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review/refined-channels'

def function_ast(path,name):
    node=next(n for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef) and n.name==name)
    return ast.dump(node,include_attributes=False)

def main():
    plan=json.loads((OUT/'plan.json').read_text());results=json.loads((OUT/'results.json').read_text());jobs=json.loads((OUT/'jobs.json').read_text())['jobs']
    assert len(plan['plans'])==12
    manifest={};geometry=[];feeds=[];groups={};fixtures={};probes=0
    for name,digest in [('board.circuit.json',plan['sourceSha256']),('field-solver-handoff.json',plan['handoffSha256'])]:
        file=ROOT/'dist/si-channel-review'/name;assert sha(file)==digest;manifest[str(file)]=digest
    comparison=ROOT/'dist/si-channel-review/em3d/current-source-comparison.json'
    value=json.loads(comparison.read_text());current=ROOT/'dist/si-channel-review/current-source-rerun.circuit.json'
    assert value['frozenSha256']==plan['sourceSha256'] and sha(current)==value['currentSha256'] and all(t['identical'] for t in value['types'])
    manifest.update({str(p):sha(p) for p in [comparison,current]})
    region_history=OUT/'region-refinement-history.json'
    if region_history.exists():
        history=json.loads(region_history.read_text());manifest[str(region_history)]=sha(region_history)
        baseline=OUT/history['historyDirectory']/'fine-USB4_TX1-matrix.npz'
        case=Path(history['failedStudy']['directory'])
        a,b=waves(read_case(case));s=np.load(baseline)['s_mixed']
        change=float(abs((b-np.einsum('fij,fj->fi',s,a))/a[:,3,None]).max())
        assert abs(change-history['failedStudy']['maximumComplexChange'])<1e-12
        manifest[str(baseline)]=sha(baseline)
    interrupted=[]
    if (OUT/'interrupted-attempts.json').exists():
        file=OUT/'interrupted-attempts.json';interrupted=json.loads(file.read_text())['attempts'];manifest[str(file)]=sha(file)
        for attempt in interrupted:
            path=Path(attempt['directory']);assert str(path) not in {j['directory'] for j in jobs}
            manifest.update(hashes(path))
            for name in ['solver.log','status.json']:
                file=path/name;manifest[str(file)]=sha(file)
    preflight=json.loads((OUT/'preflight-physical-model-comparison.json').read_text())
    assert preflight['passed'] and len(preflight['cases'])==12
    for case in preflight['cases']:
        assert [physical_hash(Path(p)) for p in case['paths']]==case['sha256']
        for path in case['paths']:
            file=Path(path)/'model.xml';manifest[str(file)]=sha(file)
    for key in ['calibration','rotationCalibration']:
        cal=results[key];assert cal['complete'] and cal['passed'],key
        for name,digest in cal['inputSha256'].items():
            file=Path(name);file=file if file.is_absolute() else ROOT/file
            assert sha(file)==digest,(key,file);manifest[str(file)]=digest
    rotation=results['rotationCalibration'];old=Path(rotation['rotatedCase'])/'generalized-probes-source.py'
    if not old.is_absolute():old=ROOT/old
    assert function_ast(old,'measurement')==function_ast(ROOT/'simulations/channel-si/batch_em3d.py','measurement'),'Probe algorithm changed since rotation calibration'
    for job in jobs:
        path=Path(job['directory']);case=read_case(path);setup=case['setup'];assert case['status']['state']=='completed',path
        if '--plan-file' in job['arguments']:
            file=Path(job['arguments'][job['arguments'].index('--plan-file')+1]);manifest[str(file)]=sha(file)
            if job.get('regionRevision')==2:assert sha(file)==job['planSha256']
        waves(case);probes+=len(case['probeChecks'])
        assert all(abs(g['physicalGapMm']-.0497)<1e-9 for g in setup['terminalGaps']),path
        feed=inspect_feed(path);feeds.append(feed)
        if job['channel']!='CALIBRATION':
            assert setup['sourceSha256']==plan['sourceSha256'] and setup['handoffSha256']==plan['handoffSha256']
            expected=next(p for p in plan['plans'] if p['channel']==job['channel'])
            physical=lambda p:{k:v for k,v in p.items() if k!='extraMeshVias'}
            assert physical(setup['regionPlan'])==physical(expected),(path,'Physical extraction plan changed')
            assert setup['physicalBoardOutlinePreserved']
            assert all(v['covered'] for v in setup['signalViaLandChecks'])
            assert all(v['passed'] for k in ['feedCollisionChecks','pmlMaterialChecks','maskOpeningChecks','viaDiscretizationChecks'] for v in setup.get(k,[]))
            assert all(v['verticalPECNodes']>=3 for v in setup['viaDiscretizationChecks'])
            # A sensitivity study must retain the same physical terminals and
            # measurement planes. Mesh indices can change; coordinates cannot.
            fixture={'ports':setup['ports'],
                'references':[m['reference'] for m in setup['lineMeasurement']],
                'gaps':[{k:g[k] for k in ['start','stop','physicalGapMm']} for g in setup['terminalGaps']]}
            expected_fixture=fixtures.setdefault(job['channel'],fixture)
            assert fixture==expected_fixture,(path,'Physical fixture changed between studies')
            groups.setdefault((job['channel'],job['suite']),[]).append(functional_model_hash(path))
            geometry.append({'directory':str(path.relative_to(ROOT)),'channel':job['channel'],'suite':job['suite'],
                'meshLines':setup['meshLines'],'boundsMm':setup['boundsMm'],'minimumMeshStepMm':setup['minimumMeshStepMm'],
                'viaDiscretizationChecks':setup['viaDiscretizationChecks'],'maskOpenings':setup.get('exposedPadMaskOpenings',0),'passed':True})
        assert (path/'solver.log').stat().st_size>0
        manifest.update(hashes(path))
        for name in ['solver.log','status.json','batch-time-stop.json']:
            if (path/name).exists():manifest[str(path/name)]=sha(path/name)
    assert all(len(set(v))==1 for v in groups.values()),'Model changed across excitations'
    for c in results['channels']:
        phase_jobs=[next(j for j in jobs if j['channel']==c['channel'] and j['suite']==s and j['mode']=='d1') for s in ['coarse','fine']]
        assert [j['resolution'] for j in phase_jobs]==[.025,.02]
        assert len({'--resolve-lands' in j['arguments'] for j in phase_jobs})==1
        ph=[physical_hash(Path(j['directory'])) for j in phase_jobs]
        assert ph==c['physicalGeometryBetweenMeshes']['sha256']
        recorded={k:v for s in ['coarse','fine'] for k,v in c[s]['inputSha256'].items()}
        for s in c['studies']:recorded.update(s['inputSha256'])
        assert all(manifest.get(k)==v for k,v in recorded.items()),c['channel']
        file=OUT/(c['channel']+('-local.s4p' if c['allExtractionChecksPassed'] else '-local-diagnostic.s4p'))
        tokens=[]
        for line in file.read_text().splitlines():
            if line.startswith('#'):assert line=='# Hz S RI R 42.5'
            elif line.strip() and not line.startswith('!'):tokens.extend(map(float,line.split()))
        values=np.array(tokens).reshape(-1,33);assert values.shape==(177,33)
        raw=np.load(OUT/'fine'/f"{c['channel']}-matrix.npz");assert np.array_equal(values[:,0],raw['frequency'])
        parsed=(values[:,1::2]+1j*values[:,2::2]).reshape(-1,4,4)
        assert abs(parsed-raw['s_single_ended']).max()<1e-12
        manifest[str(file)]=sha(file)
    parser=Links();parser.feed((OUT/'report.html').read_text());links=[]
    for target in parser.targets:
        parsed=urlparse(target)
        if parsed.scheme or parsed.netloc or not parsed.path:continue
        assert (OUT/unquote(parsed.path)).resolve().is_file(),target;links.append(target)
    for name in ['plan.json','jobs.json','results.json','report.html','preflight.json','preflight-physical-model-comparison.json','fixtures.png','local-il.png','local-rl.png','local-conversion.png']:
        manifest[str(OUT/name)]=sha(OUT/name)
    if (OUT/'parallel-scheduling-change.json').exists():
        manifest[str(OUT/'parallel-scheduling-change.json')]=sha(OUT/'parallel-scheduling-change.json')
    (OUT/'selected-geometry-checks.json').write_text(json.dumps({'passed':True,'cases':geometry},indent=2)+'\n')
    (OUT/'feed-fixture-checks.json').write_text(json.dumps({'passed':all(f['passed'] for f in feeds),'cases':feeds},indent=2)+'\n')
    reproduction={'python':'/private/tmp/flamingo-pcie-si-venv/bin/python','jobs':'jobs.json',
        'commands':['simulations/channel-si/run_refined_batch.py --workers 4 --max-preparing 3 --max-per-channel 1','simulations/channel-si/analyze_refined_channels.py',
            'simulations/channel-si/plot_batch_fixtures.py --root dist/si-channel-review/refined-channels',
            'simulations/channel-si/render_channel_batch.py --root dist/si-channel-review/refined-channels','simulations/channel-si/audit_refined_channels.py'],
        'scriptSha256':{str(p.relative_to(ROOT)):sha(p) for p in (ROOT/'simulations/channel-si').glob('*.py')},
        'note':'Saved case sources, arguments and setup.regionPlan capture the exact mesh recipe. Final coarse/fine comparisons use consistent feature rules at main grid steps 0.025/0.02 mm. Earlier TX1 runs remain as refinement history. Its final baseline margin is 2.4 mm, checked against 4.0 mm; the expanded check moves the absorber to clear the physical board cutout. jobs.json identifies every original native directory and argument. Copper/material/source geometry is checked between the selected mesh levels. Native CSX uses full precision; XML is diagnostic serialization. Completed native cases are reused by the batch runner.'}
    (OUT/'reproduction.json').write_text(json.dumps(reproduction,indent=2)+'\n')
    for name in ['selected-geometry-checks.json','feed-fixture-checks.json','reproduction.json']:manifest[str(OUT/name)]=sha(OUT/name)
    summary={'passed':True,'scope':'Evidence integrity only; extraction and fixture acceptance are separate.',
        'allExtractionChecksPassed':results['allExtractionChecksPassed'],'feedFixtureAcceptancePassed':all(f['passed'] for f in feeds),
        'selectedSimulations':len(jobs),'nativeCurrentProbeChecks':probes,'feedFixtureCasesPassed':sum(f['passed'] for f in feeds),
        'interruptedAttemptsRetained':len(interrupted),
        'historicalSelectedSimulations':sum(j['suite']=='intermediate' or j['suite'].startswith('history-') for j in jobs),
        'feedFixtureCasesFailed':sum(not f['passed'] for f in feeds),'touchstoneFiles':12,'localLinks':len(links),'inputFiles':len(manifest),
        'checkedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':manifest}
    (OUT/'evidence-integrity-check.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k!='sha256'},indent=2))

if __name__=='__main__':main()
