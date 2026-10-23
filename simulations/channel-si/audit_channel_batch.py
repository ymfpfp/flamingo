"""Audit selected native records and exported data after the complete batch."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlparse
import hashlib, json, time
import numpy as np
from analyze_channel_batch import OUT, ROOT, MODES, case_path, hashes, functional_model_hash
from analyze_extraction import read_case, waves
from audit_feed_fixtures import inspect as inspect_feed

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.targets=[]
    def handle_starttag(self, tag, attrs):
        self.targets += [v for k,v in attrs if k in ['href','src'] and v]

def main():
    plan=json.loads((OUT/'plan.json').read_text())
    results=json.loads((OUT/'results.json').read_text())
    assert sha(ROOT/'dist/si-channel-review/board.circuit.json')==plan['sourceSha256']
    assert sha(ROOT/'dist/si-channel-review/field-solver-handoff.json')==plan['handoffSha256']
    selected=[]
    for p in plan['plans']:
        if not p['supported'] or p.get('priorReferenceOnly'):continue
        for suite,res,modes in [('coarse',.04,MODES),('fine',.025,MODES)]+[(s,.04,['d2','c2']) for s in ['crop','padding','vertical','mask']]:
            selected += [case_path(suite,p['channel'],res,m) for m in modes]
    assert len(selected)==176
    manifest={};geometry=[];feeds=[];probe_count=0;model_groups={}
    for name in ['board.circuit.json','field-solver-handoff.json']:
        file=ROOT/'dist/si-channel-review'/name;manifest[str(file)]=sha(file)
    comparison=ROOT/'dist/si-channel-review/em3d/current-source-comparison.json'
    if comparison.exists():
        value=json.loads(comparison.read_text());current=ROOT/'dist/si-channel-review/current-source-rerun.circuit.json'
        assert value['frozenSha256']==plan['sourceSha256'] and sha(current)==value['currentSha256']
        assert all(v['identical'] for v in value['types'])
        for file in [comparison,current]:manifest[str(file)]=sha(file)
    for key in ['calibration','rotationCalibration']:
        control=results[key];assert control['complete'] and control['passed']
        for name,digest in control['inputSha256'].items():
            file=Path(name);file=file if file.is_absolute() else ROOT/file
            assert sha(file)==digest,(key,file)
            manifest[str(file)]=digest
    for path in selected:
        case=read_case(path);setup=case['setup'];assert case['status']['state']=='completed',path
        waves(case) # Recompute spectra and compare with the native saved values.
        probe_count+=len(case['probeChecks'])
        assert setup['sourceSha256']==plan['sourceSha256'] and setup['handoffSha256']==plan['handoffSha256']
        expected=next(p for p in plan['plans'] if p['channel']==setup['channel'])
        # Return-via annotations were added after the first two USB models.
        # Their physical crop and selected conductors did not change.
        physical=lambda p:{k:v for k,v in p.items() if k!='principalReturnVias'}
        assert physical(setup['regionPlan'])==physical(expected),(path,'stale geometry plan')
        xlo,ylo,xhi,yhi=setup['boundsMm']
        assert all(xlo<v['x']<xhi and ylo<v['y']<yhi for v in expected.get('principalReturnVias',[]))
        assert setup['physicalBoardOutlinePreserved']
        assert all(v['covered'] for v in setup['signalViaLandChecks'])
        assert all(v['passed'] for k in ['feedCollisionChecks','pmlMaterialChecks','maskOpeningChecks'] for v in setup.get(k,[]))
        geometry.append({'directory':str(path.relative_to(ROOT)),'channel':setup['channel'],
            'suite':setup['runArguments']['suite'],'meshLines':setup['meshLines'],
            'boundsMm':setup['boundsMm'],'minimumMeshStepMm':setup['minimumMeshStepMm'],
            'maskOpenings':setup.get('exposedPadMaskOpenings',0),'passed':True})
        key=(setup['channel'],setup['runArguments']['suite'])
        model_groups.setdefault(key,[]).append(functional_model_hash(path))
        feed=inspect_feed(path);feeds.append(feed)
        assert (path/'solver.log').stat().st_size>0,path
        manifest.update(hashes(path))
        for name in ['solver.log','status.json','batch-time-stop.json']:
            if (path/name).exists():manifest[str(path/name)]=sha(path/name)
    assert all(len(set(values))==1 for values in model_groups.values()),'Model changed across excitations'
    for c in results['channels']:
        expected={k:v for phase in ['coarse','fine'] for k,v in c[phase].get('inputSha256',{}).items()}
        for study in c['studies']:expected.update(study.get('inputSha256',{}))
        assert all(manifest.get(k)==v for k,v in expected.items()),c['channel']
        filename=c['channel']+('-local.s4p' if c['allExtractionChecksPassed'] else '-local-diagnostic.s4p')
        path=OUT/filename;tokens=[]
        for line in path.read_text().splitlines():
            if line.startswith('#'):assert line=='# Hz S RI R 42.5'
            elif line.strip() and not line.startswith('!'):tokens.extend(float(x) for x in line.split())
        values=np.array(tokens).reshape(-1,33);assert values.shape==(177,33)
        raw=np.load(OUT/'fine'/f"{c['channel']}-matrix.npz")
        assert np.array_equal(values[:,0],raw['frequency'])
        parsed=(values[:,1::2]+1j*values[:,2::2]).reshape(-1,4,4)
        assert np.max(abs(parsed-raw['s_single_ended']))<1e-12,c['channel']
        manifest[str(path)]=sha(path)
    parser=Links();parser.feed((OUT/'report.html').read_text());links=[]
    for target in parser.targets:
        parsed=urlparse(target)
        if parsed.scheme or parsed.netloc or not parsed.path:continue
        file=(OUT/unquote(parsed.path)).resolve();assert file.is_file(),target
        links.append(target)
    for name in ['plan.json','results.json','report.html','rotation-check.json','fixtures.png','local-il.png','local-rl.png','local-conversion.png']:
        manifest[str(OUT/name)]=sha(OUT/name)
    scripts={str(p.relative_to(ROOT)):sha(p) for p in sorted((ROOT/'simulations/channel-si').glob('*.py'))}
    (OUT/'selected-geometry-checks.json').write_text(json.dumps({'passed':True,'cases':geometry},indent=2)+'\n')
    (OUT/'feed-fixture-checks.json').write_text(json.dumps({'passed':all(f['passed'] for f in feeds),'cases':feeds},indent=2)+'\n')
    reproduction={'python':'/private/tmp/flamingo-pcie-si-venv/bin/python',
        'commands':['simulations/channel-si/run_channel_batch.py --phase all --workers 4',
            'simulations/channel-si/analyze_channel_batch.py','simulations/channel-si/plot_batch_fixtures.py',
            'simulations/channel-si/render_channel_batch.py','simulations/channel-si/audit_channel_batch.py'],
        'sourceSha256':plan['sourceSha256'],'handoffSha256':plan['handoffSha256'],'scriptSha256':scripts,
        'note':'Use saved driver/dependency copies and each setup.runArguments to reproduce historical cases. The batch runner reuses completed cases. Geometry and solver files retain full in-memory precision; XML is a diagnostic serialization.'}
    (OUT/'reproduction.json').write_text(json.dumps(reproduction,indent=2)+'\n')
    for name in ['selected-geometry-checks.json','feed-fixture-checks.json','reproduction.json']:
        manifest[str(OUT/name)]=sha(OUT/name)
    output={'passed':True,'scope':'Evidence integrity only; extraction accuracy and feed-fixture acceptance are separate.',
        'allExtractionChecksPassed':results['allExtractionChecksPassed'],'feedFixtureAcceptancePassed':all(f['passed'] for f in feeds),
        'selectedSimulations':len(selected),'nativeCurrentProbeChecks':probe_count,
        'feedFixtureCasesPassed':sum(f['passed'] for f in feeds),'feedFixtureCasesFailed':sum(not f['passed'] for f in feeds),
        'touchstoneFiles':len(results['channels']),'localLinks':len(links),'inputFiles':len(manifest),
        'sourceSha256':plan['sourceSha256'],'handoffSha256':plan['handoffSha256'],
        'checkedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':manifest}
    (OUT/'evidence-integrity-check.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({k:v for k,v in output.items() if k!='sha256'},indent=2))

if __name__=='__main__':main()
