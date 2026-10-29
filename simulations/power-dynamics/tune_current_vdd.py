"""Screen TPS62903 VDD tuning without inventing a controller transfer function.

All bank substitutions are hypothetical targets. A selected physical component,
layout, regulator stability check and loaded-startup check are required before
any target becomes a board change. Feed-forward analysis does not shorten the
prescribed regulator-response delay.
"""
import argparse
import copy
import hashlib
import itertools
import json
from pathlib import Path
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--review',required=True)
p.add_argument('--out',required=True)
p.add_argument('--loads',default='simulations/power-dynamics/provisional-loads.json')
args=p.parse_args()
OUT=ROOT/args.out
OUT.mkdir(parents=True,exist_ok=True)

# Reuse the exact existing passive equations and capacitor curves, stopping
# before their report runner. Fail visibly if its definition boundary changes.
model_file=Path(__file__).with_name('run_review.py')
text=model_file.read_text()
marker='\nprofiles = ["typical_dc", "low_ac_sensitivity", "half_nominal_sensitivity"]'
assert text.count(marker)==1,'Review runner changed; inspect its function boundary'
original_argv=sys.argv[:]
try:
    sys.argv=[str(model_file),'--review',args.review,'--out',str(OUT.relative_to(ROOT)/'model-input'),
              '--loads',args.loads]
    model={'__file__':str(model_file),'__name__':'vdd_passive_equations'}
    exec(compile(text.split(marker)[0],str(model_file),'exec'),model)
finally:
    sys.argv=original_argv
base=next(r for r in model['rail_inputs'] if r['rail']=='VDD')
nominal=base['regulatorNominalV']
profiles=['low_ac_sensitivity','half_nominal_sensitivity']
static=next(r for r in model['review']['margins']['converter'] if r['rail']=='VDD')
startup=model['review']['margins']['startup']

def minimum_explicit_damping(branches):
    # Never credit an unspecified minimum capacitor ESR or a guessed contact
    # resistance to the regulator's 10 mOhm distributed-capacitance condition.
    return 1/sum(1/(b['seriesResistanceOhm']*(1-b['resistorToleranceFraction'])*
        (1-b['resistorTcrPpmK']*1e-6*125)) for b in branches)

def corner_set(r,*,expanded=False,samples=200):
    values=itertools.product(profiles,[1,5,20] if expanded else [5,20],
       [.2,1] if expanded else [1],[0,.2,.5,1,2] if expanded else [2],['up','down'])
    cases=[]
    for profile,link,mount,delay,direction in values:
        cases.append(model['transient'](r,profile,link,mount,1,delay,direction,samples_per_us=samples))
    low=min(c['lowToleranceMinimumV'] for c in cases)
    high=max(c['highToleranceMaximumV'] for c in cases)
    return {'lowVBeforeRipple':low,'highVBeforeRipple':high,'spanMVBeforeRipple':1000*(high-low),
            'marginMVBeforeRipple':1000*min(low-1.1,1.16-high),'cases':cases}

baseline=corner_set(base)
rows=[]
# The damping sweep includes inadmissible low-resistance trials to expose why
# removing the damping is not an acceptable fix. They are never recommended.
for count,cap,rmilliohm in itertools.product([2,4,6],[330,470,680,1000],[0,5,10,15,22,27,33,47,68]):
    r=copy.deepcopy(base)
    r['reserveBranches']=[copy.deepcopy(base['reserveBranches'][i%2]) for i in range(count)]
    for branch in r['reserveBranches']:
        branch['capacitanceF']=cap*1e-6
        branch['seriesResistanceOhm']=rmilliohm/1000
    damping=minimum_explicit_damping(r['reserveBranches']) if rmilliohm else 0
    c=corner_set(r)
    # This ideal translation is an optimistic lower bound on the resistor-trim
    # problem. It is not a substitute for recomputing real resistor tolerances.
    shift=(1.1+1.16-c['lowVBeforeRipple']-c['highVBeforeRipple'])/2
    maximum_cap_uf=static['maximumEffectiveCapacitanceUF']+count*cap*1.2*1.2
    startup_peak=3+maximum_cap_uf*1e-6*static['maximumV']/(startup['minimumRampMS']/1000)+static['peakToPeakInductorRippleA']/2
    row={'branches':count,'capacitancePerBranchUF':cap,'resistancePerBranchMilliohm':rmilliohm,
         'minimumExplicitParallelDampingMilliohm':damping*1000,'dampingCriterionPass':damping>=.01,
         'startupPeakCurrentScreenA':startup_peak,'startupCurrentLimitScreenPass':startup_peak<static['minimumBuckPeakCurrentLimitA'],
         'physicalPartsAndLayoutVerified':False,'nominalSetpointV':nominal,
         'lowVBeforeRipple':c['lowVBeforeRipple'],'highVBeforeRipple':c['highVBeforeRipple'],
         'spanMVBeforeRipple':c['spanMVBeforeRipple'],'marginMVBeforeRipple':c['marginMVBeforeRipple'],
         'optimisticCenteredSetpointV':nominal+shift,
         'optimisticCenteredMarginMV':(.06-(c['highVBeforeRipple']-c['lowVBeforeRipple']))*500}
    rows.append(row)
    if len(rows)%36==0:print('Passive candidates evaluated:',len(rows),flush=True)
valid=sorted((r for r in rows if r['dampingCriterionPass'] and r['startupCurrentLimitScreenPass']),key=lambda r:r['spanMVBeforeRipple'])
best=valid[0]
tuned=copy.deepcopy(base)
tuned['reserveBranches']=[copy.deepcopy(base['reserveBranches'][i%2]) for i in range(best['branches'])]
for b in tuned['reserveBranches']:
    b['capacitanceF']=best['capacitancePerBranchUF']*1e-6
    b['seriesResistanceOhm']=best['resistancePerBranchMilliohm']/1000

# Recompute real divider corners rather than merely translating the waveform.
# These are resistance targets, not claims of selected distributor inventory.
dividers=[]
error=.001+10e-6*125
for rt in [1780,1800,1820,1840,1850,1870,1890,1910]:
    r=copy.deepcopy(tuned);rb=2100
    r['regulatorNominalV']=.6*(1+rt/rb)
    r['regulatorMinimumV']=.6*.991*(1+rt*(1-error)/(rb*(1+error)))-70e-9*rt*(1+error)
    r['regulatorMaximumV']=.6*1.009*(1+rt*(1+error)/(rb*(1-error)))+70e-9*rt*(1+error)
    c=corner_set(r)
    dividers.append({'topOhm':rt,'bottomOhm':rb,'nominalV':r['regulatorNominalV'],
        'staticMinimumV':r['regulatorMinimumV'],'staticMaximumV':r['regulatorMaximumV'],
        **{k:v for k,v in c.items() if k!='cases'}})

# Cff changes a feedback-network pole and zero. Their location alone cannot
# establish crossover frequency, phase margin, or an actual response delay.
rt,rb=1870.,2100.
parallel=1/(1/rt+1/rb)
feedforward=[]
for pf in [0,100,220,470,680,1000,1500,2200,3300,4700]:
    cap=(pf+3)*1e-12
    zero=1/(2*np.pi*rt*cap);pole=1/(2*np.pi*parallel*cap)
    feedforward.append({'externalCapacitancePF':pf,'zeroHz':zero,'poleHz':pole,
        'geometricMeanHz':float(np.sqrt(zero*pole)),
        'maximumFeedbackPhaseBoostDegrees':float(np.degrees(np.arcsin((pole/zero-1)/(pole/zero+1)))),
        'closedLoopStabilityVerified':False,'transientImprovementCredited':False})

# Fine time-step checks include both load directions and the long-link case.
numeric=[]
for label,r in [('baseline',base),('best-admissible-target',tuned)]:
    for direction in ['up','down']:
        a=model['transient'](r,'half_nominal_sensitivity',20,1,1,2,direction,samples_per_us=200)
        b=model['transient'](r,'half_nominal_sensitivity',20,1,1,2,direction,samples_per_us=800)
        error_mv=1000*max(abs(a[k]-b[k]) for k in ['nominalMinimumV','nominalMaximumV'])
        numeric.append({'candidate':label,'direction':direction,'test':'time-step convergence',
                        'errorMV':error_mv,'passed':error_mv<.1})
    A,B,C,D,pars=model['matrices'](r,'half_nominal_sensitivity',20,1)
    x=model['initial_state'](nominal,nominal-pars['Rlink']*3,3,len(pars['reserve']))
    u=np.array([2.2,1.1,3e5,-4e5]);dx=A@x+B@u
    balance=pars['C0']*dx[0]+pars['C1']*dx[1]+sum(branch[0]*dx[2+k] for k,branch in enumerate(pars['reserve']))
    numeric.append({'candidate':label,'test':'capacitor charge conservation','errorA':float(abs(balance-(u[0]-u[1]))),
                    'passed':bool(abs(balance-(u[0]-u[1]))<1e-10)})

baseline_expanded=corner_set(base,expanded=True)
best_expanded=corner_set(tuned,expanded=True)
result={'sourceFile':model['review']['sourceFile'],'sourceSha256':model['sha'],
 'status':'No verified VDD repair; no PCB component changes applied',
 'regulator':'TPS62903RPJR','regulatorReplaced':False,'hardwareChanged':False,'closedLoopValidated':False,
 'bankTargetsEvaluated':len(rows),'dampingAndStartupAdmissibleTargets':len(valid),
 'dampingAdmissibleTargets':sum(r['dampingCriterionPass'] for r in rows),'dividerTargetsEvaluated':len(dividers),
 'feedforwardTargetsEvaluated':len(feedforward),'baseline':baseline_expanded,'bestAdmissibleTarget':best,
 'bestAdmissibleExpandedScreen':best_expanded,'bankCandidates':rows,'dividerCandidates':dividers,
 'feedforwardNetwork':feedforward,'numericChecks':numeric,
 'assumptions':{'designCurrentA':3,'stepA':3,'loadEdgeNS':200,'responseDelayUS':[0,.2,.5,1,2],
   'linkNH':[1,5,20],'mountPerCapNH':[.2,1],'loadCurrentSpectrumVerified':False,
   'referenceAndDividerCornersIncluded':True,'requiredVoltageRange':[1.1,1.16]},
 'limitations':[
  'No voltage limits, current-step criteria, or response-delay assumptions were relaxed to obtain a pass.',
  'All bank candidates are hypothetical parameter targets. New component ESR/ESL, size, sourcing and routing are not verified.',
  'The existing simple current-source model cannot represent a feed-forward capacitor or prove a TPS62903 feedback-loop response.',
  'Passing the minimum-resistance and loaded-startup screens is necessary guidance, not proof of regulator stability or startup behavior.',
  'Candidate voltage extrema exclude switching ripple. A pre-ripple failure cannot be rescued by adding ripple allowance.',
  'Ideal setpoint centering is an optimistic feasibility bound; actual resistor corners are evaluated separately.',
  'The actual chip current step and regulator delay are unmeasured. These are conditional stress tests, not predictions of real failures.'],
 'references':[
  {'title':'TPS62903 datasheet: LC, feedback network and distributed capacitance','url':'https://www.ti.com/lit/ds/symlink/tps62903.pdf'},
  {'title':'Feedforward capacitor selection requires original crossover measurement','url':'https://www.ti.com/lit/an/slva466a/slva466a.pdf'},
  {'title':'Optimizing transient response with feedforward capacitor','url':'https://www.ti.com/lit/an/slva289b/slva289b.pdf'}],
 'inputSha256':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in
   [Path(__file__),model_file,Path(__file__).with_name('damped_bank.py'),Path(__file__).with_name('reference-curves.json'),
    ROOT/args.review,ROOT/args.loads]}}
assert all(x['passed'] for x in numeric),numeric
(OUT/'tuning-results.json').write_text(json.dumps(result,indent=2)+'\n')

# Compare the same full load-release event; the candidate is not an applied PCB.
fig,ax=plt.subplots(figsize=(9,4.5))
for name,r in [('Current board',base),('Best damping/startup target (not applied)',tuned)]:
    c,t,y,u,params=model['transient'](r,'half_nominal_sensitivity',20,1,1,2,'down',return_wave=True)
    ax.plot(t*1e6,y+r['regulatorMaximumV']-r['regulatorNominalV'],label=name)
ax.axhline(1.16,color='firebrick',ls='--',label='Required upper voltage')
ax.set(xlabel='Time (µs)',ylabel='VDD high-tolerance corner (V)',
 title='Conditional first-response model: 3 A → 0 A, assumed 2 µs delay')
ax.legend(fontsize=8);ax.grid(alpha=.2);fig.tight_layout()
fig.savefig(OUT/'load-release-comparison.png',dpi=160);plt.close(fig)
print(json.dumps({'bankTargets':len(rows),'admissibleTargets':len(valid),'best':best,
 'baselineRangeBeforeRipple':[baseline_expanded['lowVBeforeRipple'],baseline_expanded['highVBeforeRipple']],
 'bestRangeBeforeRipple':[best_expanded['lowVBeforeRipple'],best_expanded['highVBeforeRipple']],
 'numericalChecksPassed':all(x['passed'] for x in numeric)},indent=2))
