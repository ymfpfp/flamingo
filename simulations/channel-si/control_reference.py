"""Solve the exact stepped FDTD control in the independent 2D solver."""
from pathlib import Path
import argparse,sys,json,hashlib
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'simulations/pcie-tx'))
from cross_section import Section,analyze
from selected_campaign_analysis import input_binding

def generate(output_root=None,control_height_mm=.0994,input_root=None,plan_file=None):
    out=Path(output_root).resolve() if output_root else ROOT/'dist/si-channel-review/em3d/iterations'
    binding=None
    if input_root is not None:
        plan=json.loads(Path(plan_file).read_text()) if plan_file else None
        binding=input_binding(input_root,plan)
        assert abs(control_height_mm-binding['controlHeightMm'])<1e-12,'Control/reference height differs from selected stackup'
    cases=[]
    for step in [.001,.0005]:
        result=analyze(Section(height=control_height_mm,step=step),metal_profile='two_step')
        cases.append(result)
        print(json.dumps({'stepMm':step,'heightMm':control_height_mm,'impedanceOhm':result['impedance_ohm'],'effectiveEr':result['effective_er']}),flush=True)
    result={'metalProfile':'Two copper slices, matching the native FDTD control exactly',
        'controlHeightMm':control_height_mm,'cases':cases,
        'relativeImpedanceMeshChange':abs(cases[-1]['impedance_ohm']/cases[-2]['impedance_ohm']-1),
        'relativeEffectiveErMeshChange':abs(cases[-1]['effective_er']/cases[-2]['effective_er']-1),
        'sourceSha256':hashlib.sha256((ROOT/'simulations/pcie-tx/cross_section.py').read_bytes()).hexdigest(),
        'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    if binding is not None:result['inputBinding']=binding
    out.mkdir(parents=True,exist_ok=True)
    (out/'control-cross-section-reference.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output-root',type=Path)
    parser.add_argument('--input-root',type=Path);parser.add_argument('--plan-file',type=Path)
    parser.add_argument('--control-height-mm',type=float,default=.0994)
    args=parser.parse_args();generate(args.output_root,args.control_height_mm,args.input_root,args.plan_file)
