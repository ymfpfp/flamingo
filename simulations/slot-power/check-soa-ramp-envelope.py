"""Independent prescribed-ramp screen; these ramps are not circuit predictions."""
from pathlib import Path
import json
import math
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/slot-startup-soa-2026-10-22'
data=json.loads((ROOT/'simulations/slot-power/soa-inputs.json').read_text())

def ilim(part,v,t,temp=25):
    p=data['parts'][part]
    curves=p.get('curves',p.get('constantPowerCurvesW'))
    xs=sorted(float(x) for x in curves)
    ys=[]
    for x in xs:
        values=next(a for k,a in curves.items() if float(k)==x)
        if isinstance(values,list):
            points=sorted(set(tuple(q) for q in values))
            ys.append(float(np.exp(np.interp(np.log(v),np.log([q[0] for q in points]),np.log([q[1] for q in points])))))
        else:ys.append(min(values/v,p['pulseCurrentCeilingA'],v/p['rdsBoundaryOhm']))
    value=ys[-1] if t>max(x for x in xs if x<1e10) else float(np.exp(np.interp(np.log(max(t,xs[0])),np.log(xs),np.log(ys))))
    return value*.9*(150-temp)/125

# Independent readings from AO4407A Figure 9 detect an axis or decade error.
assert 4.5<ilim('AO4407A',10,.001)<5.5
assert 2.0<ilim('AO4407A',10,.01)<2.5
assert 1.0<ilim('AO4407A',10,.1)<1.3
assert abs(ilim('AO4407A',10,.001,125)/ilim('AO4407A',10,.001)-.2)<1e-12
rows=[]
for rail,part,v,local,amps,uvlo in [('3V3','DMP2008UFG',3.465,660e-6,3,(2.3,2.8)),
                                  ('12V','AO4407A',12.6,470e-6,5.5,(8,10))]:
    for card in [0,1000]:
        cap=local*1.44+card*1e-6
        for duration in np.geomspace(.1,100,121):
            t=np.linspace(0,duration/1000,20001)
            output=v*t/t[-1]
            for load in ['idle','resistive','uvlo']:
                load_i=np.zeros_like(t) if load=='idle' else (amps*output/(12 if rail=='12V' else 3.3)
                    if load=='resistive' else amps*np.clip((output-uvlo[0])/(uvlo[1]-uvlo[0]),0,1))
                current=cap*v/t[-1]+load_i
                power=(v-output)*current
                energy=float(np.trapezoid(power,t))
                peak=float(max(power))
                equivalent=energy/peak
                if load=='idle':assert abs(energy-.5*cap*v*v)<1e-10
                for temp in [25,85,125]:
                    rows.append({'rail':rail,'cardCapacitanceUF':card,'load':load,'initialTemperatureC':temp,
                                 'rampDurationMs':float(duration),'peakPowerW':peak,'energyJ':energy,
                                 'equivalentWidthMs':equivalent*1000,
                                 'estimatedStressRatio':peak/v/ilim(part,v,equivalent,temp)})
summary=[]
for rail in ['3V3','12V']:
    for load in ['idle','resistive','uvlo']:
        for temp in [25,85,125]:
            a=[r for r in rows if r['rail']==rail and r['load']==load and r['initialTemperatureC']==temp and r['cardCapacitanceUF']==1000]
            best=min(a,key=lambda r:r['estimatedStressRatio'])
            summary.append({'rail':rail,'load':load,'initialTemperatureC':temp,
                            'bestRampDurationMs':best['rampDurationMs'],'smallestEstimatedRatio':best['estimatedStressRatio']})
result={'scope':'Independent ideal linear-output-ramp sensitivity. No gate RC or transistor waveform prediction.',
        'controls':{'aoGraphReadingsPass':True,'temperatureDeratingPass':True,'idleCapacitorEnergyPass':True},
        'assumptions':'No source loss, no gate dynamics, no thermal feedback. Board bulk factor 1.44, assumed card capacitance 0/1000 uF. Bleeder current omitted.',
        'cases':len(rows),'summary':summary,'results':rows,'hardwareQualified':False}
(OUT/'independent-ramp-envelope.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'controls':result['controls'],'cases':len(rows),'summary':summary},indent=2))
