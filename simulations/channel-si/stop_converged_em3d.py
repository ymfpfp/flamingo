"""Stop an active experiment only after a frequency-domain time-record check.

openEMS documents its ABORT file as a graceful stop. This script never grants
design acceptance. The final report independently checks the saved waveforms.
"""
from pathlib import Path
import argparse
import json
import numpy as np
from openEMS.utilities import DFT_time2freq

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/si-channel-review/em3d'
F=np.linspace(1e9,12e9,177)
T=np.array([[1,-1,0,0],[0,0,1,-1],[1,1,0,0],[0,0,1,1]])/np.sqrt(2)
rows=[]
parser=argparse.ArgumentParser()
parser.add_argument('--tolerance',type=float,default=.005)
parser.add_argument('--include-controls',action='store_true')
parser.add_argument('--suite',type=Path,default=OUT)
parser.add_argument('--minimum-time-ns',type=float,default=1.2)
args=parser.parse_args()
for p in sorted(args.suite.iterdir()):
    if not (p.name.startswith('board-') or args.include_controls and p.name.startswith('control-')):continue
    tolerance=min(args.tolerance,.001) if p.name.startswith('control-') else args.tolerance
    status_file=p/'status.json'
    if not status_file.exists():continue
    status=json.loads(status_file.read_text())
    if status['state']!='running':continue
    setup=json.loads((p/'setup.json').read_text())
    try:
        if setup.get('measurementStyle')=='line':
            from analyze_extraction import read_case
            data=[d for pair in read_case(p)['records'] for d in pair]
        else:
            data=[np.loadtxt(p/f'port_{kind}_{i}',comments='%',ndmin=2)
                  for i in range(1,5) for kind in ['ut','it']]
    except (OSError,ValueError,IndexError):continue
    if any(d.shape[0]<2 or d.shape[1]!=2 for d in data):continue
    end=min(d[-1,0] for d in data)
    if end<args.minimum_time_ns*1e-9:continue
    mode=setup['excitation']
    active={'d1':0,'d2':1,'c1':2,'c2':3}[mode]
    def response(fraction):
        values=[]
        for d in data:
            if fraction<1:d=d[d[:,0]<=end*fraction]
            values.append(DFT_time2freq(d[:,0],d[:,1],F))
        u=np.array(values[::2]).T;i=np.array(values[1::2]).T
        a=(u+42.5*i)/2@T.T;b=(u-42.5*i)/2@T.T
        return b/a[:,active,None]
    full=response(1.)
    differences=np.array([abs(response(frac)-full) for frac in [.65,.8]])
    peak=np.unravel_index(np.argmax(differences),differences.shape)
    delta=float(differences[peak])
    row={'directory':p.name,'endTimeNS':float(end*1e9),'maximumComplexWaveChange':delta,
         'worstFrequencyGHz':float(F[peak[1]]/1e9),'worstOutgoingMode':['d1','d2','c1','c2'][peak[2]],
         'frequencyHz':F.tolist(),'fractions':[.65,.8,1.],'criterion':tolerance,'converged':delta<tolerance}
    rows.append(row)
    checkpoint=p/'time-convergence-checkpoint.json'
    previous=json.loads(checkpoint.read_text()) if checkpoint.exists() else None
    if (row['converged'] and previous and previous['converged']
            and previous['criterion']<=tolerance and end*1e9-previous['endTimeNS']>.05):
        row['action']='Graceful stop after two passing time-record checks'
        (p/'time-convergence-stop.json').write_text(json.dumps(row,indent=2))
        (p/'ABORT').write_text('Frequency-domain time-record convergence; see time-convergence-stop.json\n')
    # Frequent observations must not reset the minimum time separation.
    retain_first_pass=(row['converged'] and previous and previous['converged']
        and previous['criterion']<=tolerance and end*1e9-previous['endTimeNS']<=.05)
    if not retain_first_pass:checkpoint.write_text(json.dumps(row,indent=2))
print(json.dumps([{k:v for k,v in row.items() if k!='frequencyHz'} for row in rows],indent=2))
