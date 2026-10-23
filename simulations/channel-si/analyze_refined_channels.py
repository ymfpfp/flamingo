"""Apply unchanged acceptance limits to the corrected extraction jobs."""
from pathlib import Path
import argparse,hashlib,json,xml.etree.ElementTree as ET
import numpy as np
import analyze_channel_batch as original
from refined_checks import line_controls
from selected_campaign_analysis import input_binding,reuse_rotation
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'dist/si-channel-review/refined-channels'

def physical_hash(path):
    root=ET.parse(path/'model.xml').getroot().find('ContinuousStructure')
    root.remove(root.find('RectilinearGrid'));properties=root.find('Properties')
    for element in list(properties):
        if element.tag in ['Excitation','ProbeBox']:properties.remove(element)
    for element in root.iter():
        element.attrib.pop('ID',None)
        for child in list(element):
            if child.tag in ['FillColor','EdgeColor']:element.remove(child)
    return hashlib.sha256(ET.tostring(root)).hexdigest()

def review(root=None,input_root=None,reference_file=None,rotation_file=None):
    out=Path(root).resolve() if root else OUT
    isolated=out.resolve()!=OUT.resolve()
    if isolated:assert input_root is not None,'An isolated campaign requires its explicit frozen input root'
    original.OUT=out
    plan=json.loads((out/'plan.json').read_text());jobs=json.loads((out/'jobs.json').read_text())['jobs']
    binding=input_binding(input_root,plan) if input_root is not None else None
    if isolated:
        for job in jobs:
            path=Path(job['directory']).resolve()
            assert path.is_relative_to(out),('Native job is outside isolated campaign',str(path))
            if (path/'setup.json').exists():
                setup=json.loads((path/'setup.json').read_text())
                for key in ['sourceSha256','handoffSha256']:
                    assert setup[key]==binding[key],('Native case binding mismatch',str(path),key)
    for suite in ['coarse','fine']:(out/suite).mkdir(parents=True,exist_ok=True)
    result=[]
    for p in plan['plans']:
        c=p['channel'];phases={}
        for suite in ['coarse','fine']:
            selected=[j for j in jobs if j['channel']==c and j['suite']==suite]
            res=selected[0]['resolution']
            paths=[Path(next(j['directory'] for j in selected if j['mode']==m)) for m in original.MODES]
            try:phases[suite]=original.inspect(c,suite,res,paths=paths)
            except (AssertionError,ValueError,np.linalg.LinAlgError) as error:
                phases[suite]={'complete':True,'passed':False,'analysisError':str(error),'checks':[]}
        studies=[]
        for suite in ['crop','padding','vertical','mask']:
            for mode in ['d2','c2']:
                job=next(j for j in jobs if j['channel']==c and j['suite']==suite and j['mode']==mode)
                try:studies.append(original.study(c,suite,mode,job['resolution'],path=job['directory'],baseline_suite=job.get('baselineSuite','coarse')))
                except (AssertionError,ValueError,np.linalg.LinAlgError) as error:
                    studies.append({'suite':suite,'mode':mode,'complete':True,'passed':False,'analysisError':str(error)})
        mesh=original.mesh_change(c) if all(phases[k].get('complete') and not phases[k].get('analysisError') for k in phases) else {'complete':False}
        physical={'complete':False}
        if all(phases[k].get('complete') and not phases[k].get('analysisError') for k in phases):
            paths=[Path(next(j['directory'] for j in jobs if j['channel']==c and j['suite']==k and j['mode']=='d1')) for k in ['coarse','fine']]
            values=[physical_hash(p) for p in paths]
            physical={'complete':True,'passed':len(set(values))==1,'sha256':values}
        result.append({'channel':c,'scope':p['kind'],**phases,'mesh':mesh,'studies':studies,
            'physicalGeometryBetweenMeshes':physical,
            'localChecksPassed':bool(all(phases[k].get('passed') for k in phases) and mesh.get('passed') and physical.get('passed') and all(s.get('passed') for s in studies))})
    refpath=Path(reference_file).resolve() if reference_file else (out/'control-cross-section-reference.json' if isolated else ROOT/'dist/si-channel-review/em3d/iterations/control-cross-section-reference.json')
    if isolated:assert refpath.is_relative_to(out),'Isolated campaign cannot reuse a legacy cross-section reference'
    controls=line_controls(out/'controls',refpath,binding['controlHeightMm'] if binding else None,binding)
    rotation=reuse_rotation(out,rotation_file) if isolated else json.loads((Path(rotation_file) if rotation_file else ROOT/'dist/si-channel-review/all-channels/rotation-check.json').read_text())
    for c in result:c['allExtractionChecksPassed']=bool(c['localChecksPassed'] and controls.get('passed') and rotation['passed'])
    data={'channels':result,'calibration':controls,'rotationCalibration':rotation,
        'allExtractionChecksPassed':all(c['allExtractionChecksPassed'] for c in result),
        'sourceSha256':plan['sourceSha256'],'handoffSha256':plan['handoffSha256'],'frequencyBandGHz':[1,12],
        'fullChannelVerified':False,'eyeOrBERComputed':False,'rawMatrixAdjusted':False,
        'exposedPadsOpenInBaseline':True,
        'scope':'Nominal lossless local PCB transitions; package, component internals and full-channel compliance remain outside this model.',
        'campaignRoot':str(out),'inputBinding':binding,'independentReferenceFile':str(refpath),
        'independentReferenceSha256':hashlib.sha256(refpath.read_bytes()).hexdigest() if refpath.exists() else None,
        'analyzerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'acceptanceSourceSha256':hashlib.sha256(Path(original.__file__).read_bytes()).hexdigest()}
    temporary=out/'results.json.tmp';temporary.write_text(json.dumps(data,indent=2)+'\n');temporary.replace(out/'results.json')
    print(json.dumps([{'channel':c['channel'],'coarse':c['coarse'].get('passed'),'fine':c['fine'].get('passed'),
        'mesh':c['mesh'].get('maximumComplexChange'),'meshPassed':c['mesh'].get('passed'),
        'studiesComplete':sum(s['complete'] for s in c['studies']),'studiesPassed':sum(s.get('passed',False) for s in c['studies'])} for c in result],indent=2))
    return data

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path)
    parser.add_argument('--input-root',type=Path);parser.add_argument('--reference-file',type=Path)
    parser.add_argument('--rotation-file',type=Path);args=parser.parse_args()
    review(args.root,args.input_root,args.reference_file,args.rotation_file)
