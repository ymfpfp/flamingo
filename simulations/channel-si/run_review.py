"""Component-aware passive channel screen, not 3D EM or eye/BER sign-off.

Input: bun scripts/prepare-channel-review.mjs [fresh.circuit.json]
Python dependencies: the pinned SI environment in ../pcie-tx/requirements.txt.
"""
from pathlib import Path
import hashlib
import itertools
import json
import sys
import numpy as np
from scipy.optimize import least_squares
from shapely.geometry import Polygon, Point, LineString, box
from shapely.affinity import rotate
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/si-channel-review'
g=json.loads((OUT/'geometry.json').read_text())
assert hashlib.sha256((ROOT/g['sourceFile']).read_bytes()).hexdigest()==g['sourceSha256']
pcie=json.loads((ROOT/'dist/pcie-si/report.json').read_text())
usb=json.loads((ROOT/'dist/usb4-si/report.json').read_text())
stack_file=ROOT/'manufacturing/stackup/selected.json'
assert pcie['stackup_sha256']==hashlib.sha256(stack_file.read_bytes()).hexdigest()
normal=pcie['nominal_cross_section']
assert pcie['solver_sha256']==hashlib.sha256((ROOT/'simulations/pcie-tx/cross_section.py').read_bytes()).hexdigest()
normal_z=normal['impedance_ohm'];normal_er=normal['effective_er']
neck_cases={s['name']:(s['pair_comparison_ohm'],s['meshes'][-1]['effective_er']) for s in usb['uniform_cross_sections']}
C0=299792458.;EPS0=8.8541878128e-12
F=np.linspace(.05,16,1601)*1e9
checks=[]

def identity():
    a=np.zeros((len(F),2,2),complex);a[:,0,0]=1;a[:,1,1]=1;return a
def series(z):
    a=identity();a[:,0,1]=z;return a
def shunt(y):
    a=identity();a[:,1,0]=y;return a
def line(z,delay,attenuation=0):
    gamma=attenuation+2j*np.pi*F*delay
    a=identity();a[:,0,0]=a[:,1,1]=np.cosh(gamma);a[:,0,1]=z*np.sinh(gamma);a[:,1,0]=np.sinh(gamma)/z;return a
def s_matrix(a,zref=42.5):
    aa,bb,cc,dd=a[:,0,0],a[:,0,1],a[:,1,0],a[:,1,1]
    denom=aa+bb/zref+cc*zref+dd
    s=np.empty_like(a);s[:,0,0]=(aa+bb/zref-cc*zref-dd)/denom;s[:,1,1]=(-aa+bb/zref-cc*zref+dd)/denom
    s[:,1,0]=2/denom;s[:,0,1]=2*(aa*dd-bb*cc)/denom;return s
def db(x):return 20*np.log10(np.maximum(abs(x),1e-14))
def at(x,f):return float(np.interp(f,F,x))

# Validate conventions against an exact matched line and a series resistor.
s=s_matrix(line(42.5,100e-12))
checks.append({'name':'Matched-line reflection and phase','passed':bool(np.max(abs(s[:,0,0]))<1e-12 and np.max(abs(s[:,1,0]-np.exp(-2j*np.pi*F*100e-12)))<1e-12)})
s=s_matrix(series(np.full(len(F),10.)))
checks.append({'name':'Series-resistor analytic scattering','passed':bool(np.max(abs(s[:,1,0]-85/95))<1e-12 and np.max(abs(s[:,0,0]-10/95))<1e-12)})

model_file=OUT/'references/GRM033R61E224KE01.s2p'
text=model_file.read_text();assert '!Murata Part Number: GRM033R61E224KE01' in text and '# Hz S RI R 50' in text
data=np.array([[float(v) for v in row.split()] for row in text.splitlines() if row and row[0] not in '!#'])
fm=data[:,0];sv=np.empty((len(data),2,2),complex)
sv[:,0,0]=data[:,1]+1j*data[:,2];sv[:,1,0]=data[:,3]+1j*data[:,4];sv[:,0,1]=data[:,5]+1j*data[:,6];sv[:,1,1]=data[:,7]+1j*data[:,8]
checks.append({'name':'Murata vendor-model reciprocity and passivity','maximumSingularValue':float(np.max(np.linalg.svd(sv,compute_uv=False))),
               'passed':bool(np.max(abs(sv[:,0,1]-sv[:,1,0]))<1e-9 and np.max(np.linalg.svd(sv,compute_uv=False))<1.00001)})
# The downloaded series-mode model is a single two-terminal impedance.
zv=100*sv[:,0,0]/sv[:,1,0]
checks.append({'name':'Murata series-mode topology','passed':bool(np.max(abs(sv[:,0,0]+sv[:,1,0]-1))<1e-8)})
fit_idx=(fm>=1e9)&(fm<=6e9)
def error(p):
    rr,ll=p;guess=rr+2j*np.pi*fm[fit_idx]*ll*1e-9+1/(2j*np.pi*fm[fit_idx]*220e-9)
    return np.r_[(guess-zv[fit_idx]).real,(guess-zv[fit_idx]).imag]
fit=least_squares(error,[.1,.15],bounds=([0,0],[10,5]))
murata_r,murata_lnh=fit.x
z_tx=np.interp(F,fm,zv.real)+1j*np.interp(F,fm,zv.imag)
extrap=F>fm.max()
z_tx[extrap]=murata_r+2j*np.pi*F[extrap]*murata_lnh*1e-9+1/(2j*np.pi*F[extrap]*220e-9)
rx_proxy=z_tx+1/(2j*np.pi*F*330e-9)-1/(2j*np.pi*F*220e-9)
cap_fit={'part':'GRM033R61E224KE01','source':str(model_file.relative_to(ROOT)),'minimumHz':float(fm.min()),'maximumHz':float(fm.max()),
         'seriesRFitOhm':float(murata_r),'seriesLFitNH':float(murata_lnh),'fitBandGHz':[1,6],
         'maximumComplexZFitErrorOhm':float(np.max(abs(error(fit.x)[:fit_idx.sum()]+1j*error(fit.x)[fit_idx.sum():]))),
         'qualification':'Measured typical series-mode data at 25 C and 0 V. Above 6 GHz uses a positive-RL fit, not manufacturer data. RX 330 nF uses a same-package TX-model proxy; exact RX model unavailable.'}

curves_path=ROOT/'simulations/power-dynamics/reference-curves.json'
charts=json.loads(curves_path.read_text())['cl05b224']['data']['|Z|_R']['charts']
def samsung_chart(kind):
    d=next(c for c in charts if c['graphSubType']==kind)['data'];xy=sorted((float(v['x'])*1e6,float(v['y'])) for v in d);return np.array(xy).T
fs,zs=samsung_chart('|Z|');_,rs=samsung_chart('R')
lc=(np.sqrt(np.maximum(zs**2-rs**2,0))+1/(2*np.pi*fs*220e-9))/(2*np.pi*fs)
use=(fs>=2e9)&(fs<=6e9);samsung_l=float(np.median(lc[use]));samsung_r=float(rs[-1])
z_pcie=np.interp(F,fs,rs)+1j*(2*np.pi*F*samsung_l-1/(2*np.pi*F*220e-9))
samsung_fit={'part':'CL05B224KO5NNNC','curveMaximumGHz':float(fs.max()/1e9),'seriesLFitNH':samsung_l*1e9,'highBandROhm':samsung_r,
             'qualification':'Series RLC surrogate derived from typical impedance magnitudes; no measured phase or 2-port data. Beyond 6 GHz is an extrapolation.'}
samsung_file=OUT/'references/CL05B224KO5NNN-series.s2p'
stext=samsung_file.read_text(errors='replace')
assert 'CL05B224KO5NNN Multilayer Ceramic Capacitor Sparameter Model' in stext
assert '# MHz S RI R 50.0' in stext
sd=np.array([[float(v) for v in row.split()] for row in stext.splitlines()
             if row.strip() and row.lstrip()[0] not in '!#'])
sf=sd[:,0]*1e6
ss=np.empty((len(sd),2,2),complex)
ss[:,0,0]=sd[:,1]+1j*sd[:,2];ss[:,1,0]=sd[:,3]+1j*sd[:,4]
ss[:,0,1]=sd[:,5]+1j*sd[:,6];ss[:,1,1]=sd[:,7]+1j*sd[:,8]
checks.append({'name':'Samsung exact model reciprocity, passivity and series topology',
  'passed':bool(np.max(abs(ss[:,0,1]-ss[:,1,0]))<1e-9
    and np.max(np.linalg.svd(ss,compute_uv=False))<1.00001
    and np.max(abs(ss[:,0,0]+ss[:,1,0]-1))<1e-8)})
sz=100*ss[:,0,0]/ss[:,1,0]
fitband=(sf>=1e9)&(sf<=6e9)
def samsung_error(p):
    guess=p[0]+2j*np.pi*sf[fitband]*p[1]*1e-9+1/(2j*np.pi*sf[fitband]*220e-9)
    delta=guess-sz[fitband]
    return np.r_[delta.real,delta.imag]
sfit=least_squares(samsung_error,[.5,.13],bounds=([0,0],[10,5]))
samsung_r,samsung_lnh=sfit.x;samsung_l=samsung_lnh*1e-9
z_pcie=np.interp(F,sf,sz.real)+1j*np.interp(F,sf,sz.imag)
above=F>sf.max()
endpoint_r=float(sz[-1].real)
endpoint_l=float((sz[-1].imag+1/(2*np.pi*sf[-1]*220e-9))/(2*np.pi*sf[-1]))
assert endpoint_r>0 and endpoint_l>0
z_pcie[above]=endpoint_r+2j*np.pi*F[above]*endpoint_l+1/(2j*np.pi*F[above]*220e-9)
samsung_fit={'part':'CL05B224KO5NNNC','source':str(samsung_file.relative_to(ROOT)),
  'curveMaximumGHz':float(sf.max()/1e9),'seriesLFitNH':float(samsung_lnh),'highBandROhm':float(samsung_r),
  'extrapolationROhm':endpoint_r,'extrapolationLNH':endpoint_l*1e9,
  'maximumComplexZFitErrorOhm':float(np.max(abs(samsung_error(sfit.x)[:fitband.sum()]+1j*samsung_error(sfit.x)[fitband.sum():]))),
  'qualification':'Exact manufacturer precise series-mode S-parameters, 100 Hz to 6 GHz, 25 C, 0 V. Above 6 GHz uses a positive RL model anchored continuously at the final vendor point, not vendor data.'}

def shape(p):
    if p.get('shape') in ['circle','circular']:
        return Point(p['x'],p['y']).buffer(p.get('radius',p.get('diameter',.2)/2),quad_segs=32)
    if 'width' in p and 'height' in p:
        b=box(p['x']-p['width']/2,p['y']-p['height']/2,p['x']+p['width']/2,p['y']+p['height']/2)
        return rotate(b,p.get('ccw_rotation',0),origin=(p['x'],p['y']))
    raise ValueError('Unsupported signal pad geometry: '+str(p))
planes={p['layer']:Polygon([(v['x'],v['y']) for v in p['brep_shape']['outer_ring']['vertices']],
        [[(v['x'],v['y']) for v in ring['vertices']] for ring in p['brep_shape'].get('inner_rings',[])]) for p in g['groundPlanes']}
h=g['stackup']['dielectrics'][0]['thicknessMm'];er=g['stackup']['dielectrics'][0]['designDk']
def pad_c(p):
    layer=p.get('layer','top');plane=planes['inner1' if layer=='top' else 'inner4'];area=shape(p).intersection(plane).area
    return EPS0*er*(area*1e-6)/(h/1000)
def group_pad_c(pads):return sum(pad_c(p) for p in pads)

via_delay=sum(d['thicknessMm']/1000*np.sqrt(d['designDk'])/C0 for d in g['stackup']['dielectrics'])
geometry=[]
for ch in g['channels']:
    p,n=ch['conductors'];via_rows=[]
    pv=[v for s in p['stages'] for v in s['vias']];nv=[v for s in n['stages'] for v in s['vias']]
    assert len(pv)==len(nv)
    for a,b in zip(pv,nv):
        pitch=np.hypot(a['x']-b['x'],a['y']-b['y']);diam=(a['hole_diameter']+b['hole_diameter'])/2+.04
        zd=120/np.sqrt(4.5)*np.arccosh(pitch/diam)
        via_rows.append({'pitchMm':float(pitch),'barrelMetalDiameterAssumedMm':diam,'twoWireHomogeneousProxyZdiffOhm':float(zd),
                         'nearestGroundReturnMm':[a['nearestGroundViaMm'],b['nearestGroundViaMm']],
                         'scope':'Unshielded homogeneous two-wire surrogate. Nearby ground vias, finite apertures and internal power copper alter this value.'})
    corridor_missing=0;centerline_missing=0
    for c in ch['conductors']:
        for stage in c['stages']:
            for seg in stage['segments']:
                plane=planes['inner1' if seg['layer']=='top' else 'inner4'];line2=LineString([tuple(seg['from'].values()),tuple(seg['to'].values())])
                centerline_missing+=line2.difference(plane).length
                corridor_missing+=line2.buffer(3*h+seg['widthMm']/2,cap_style=2).difference(plane).area
    geometry.append({'name':ch['name'],'bus':ch['bus'],'direction':ch['direction'],'nyquistGHz':ch['nyquistGHz'],
       'lengthsMm':[c['lengthMm'] for c in ch['conductors']],'neckLengthsMm':[c['neckLengthMm'] for c in ch['conductors']],
       'viaCountPerConductor':len(pv),'viaProxies':via_rows,'viaDelayEachPS':via_delay*1e12,
       'centerlineOverGroundOpeningMmBothLegs':centerline_missing,'threeHFieldCorridorMissingGroundAreaMM2BothLegs':corridor_missing,
       'projectedPadCapacitancePFBothLegs':sum(group_pad_c(c['startPads']+c['endPads']+[p for cmp in c['components'] for p in cmp.get('pads',cmp.get('signalPads',[]))]) for c in ch['conductors'])*1e12})

def conductor(ch,c,geo,df,roughness,neck_key,via_scale,pad_scale,via_cp,cap_l_scale=1):
    a=identity();a=a@shunt(2j*np.pi*F*group_pad_c(c['startPads'])*pad_scale)
    total_delay=0;via_index=0
    for stage_index,stage in enumerate(c['stages']):
        # Preserve the emitted ordering of every wire and via transition.
        elements=[]
        for i,p in enumerate(stage['route']):
            if p['route_type']=='via':elements.append(('via',p));continue
            if i+1>=len(stage['route']):continue
            q=stage['route'][i+1]
            if p['route_type']=='wire' and q['route_type']=='wire' and p['layer']==q['layer']:
                length=np.hypot(p['x']-q['x'],p['y']-q['y'])
                if length>1e-9:elements.append(('wire',{'widthMm':p['width'],'lengthMm':length}))
        for kind,seg in elements:
            if kind=='via':
                v=geo['viaProxies'][via_index];via_index+=1
                a=a@shunt(2j*np.pi*F*via_cp*1e-12/2)@line(v['twoWireHomogeneousProxyZdiffOhm']*via_scale/2,via_delay)@shunt(2j*np.pi*F*via_cp*1e-12/2)
                total_delay+=via_delay
                continue
            neck=seg['widthMm']<.1
            zd,ee=neck_cases[neck_key] if neck else (normal_z,normal_er)
            length=seg['lengthMm']/1000;delay=length*np.sqrt(ee)/C0;total_delay+=delay
            surface=np.sqrt(np.pi*F*(4*np.pi*1e-7)*1.724e-8)
            alpha_d=np.pi*F*np.sqrt(ee)/C0*df*length
            alpha_c=surface/(seg['widthMm']/1000*(zd/2))*length*roughness
            a=a@line(zd/2,delay,alpha_d+alpha_c)
        if ch['bus']=='USB4':
            if stage_index==0:
                cmp=next(x for x in c['components'] if x['kind']=='esd')
                # Typical 10 GHz diode capacitance; added loop inductance is
                # a sensitivity assumption, not a full vendor S-parameter model.
                z_esd=2+2j*np.pi*F*.15e-9+1/(2j*np.pi*F*.15e-12)
                a=a@shunt(1/z_esd+2j*np.pi*F*group_pad_c(cmp['signalPads'])*pad_scale)
            elif stage_index==1:
                cmp=next(x for x in c['components'] if x['kind']=='series-capacitor')
                cp=group_pad_c(cmp['pads'])*pad_scale/2
                zz=z_tx if ch['direction']=='TX' else rx_proxy
                zz=zz+2j*np.pi*F*murata_lnh*1e-9*(cap_l_scale-1)
                a=a@shunt(2j*np.pi*F*cp)@series(zz)@shunt(2j*np.pi*F*cp)
            elif stage_index==2:
                cmp=next(x for x in c['components'] if x['kind']=='shunt-resistor')
                a=a@shunt(1/220000+2j*np.pi*F*(.02e-12+group_pad_c(cmp['signalPads'])*pad_scale))
        elif ch['direction']=='TX' and stage_index==0:
            cmp=c['components'][0];cp=group_pad_c(cmp['pads'])*pad_scale/2
            zz=z_pcie+2j*np.pi*F*samsung_l*(cap_l_scale-1)
            a=a@shunt(2j*np.pi*F*cp)@series(zz)@shunt(2j*np.pi*F*cp)
    a=a@shunt(2j*np.pi*F*group_pad_c(c['endPads'])*pad_scale)
    return s_matrix(a),total_delay

cases=[];curves={};maximum_passivity=0;max_reciprocity=0
for ch,geo in zip(g['channels'],geometry):
    # Independent assumed scenarios; extrema are not proven physical bounds.
    for loss,neck,transition in itertools.product(['low','middle','high'],
            ['uniform_3mil_same_edge_gap_proxy','isolated_3mil_line'],['light','middle','heavy']):
        df,roughness={'low':(.015,1),'middle':(.02,1.5),'high':(.03,2)}[loss]
        vs,ps,vc={'light':(.8,.5,.02),'middle':(1,1,.08),'heavy':(1.2,2,.20)}[transition]
        sp,dp=conductor(ch,ch['conductors'][0],geo,df,roughness,neck,vs,ps,vc)
        sn,dn=conductor(ch,ch['conductors'][1],geo,df,roughness,neck,vs,ps,vc)
        sd=(sp+sn)/2
        for matrix in [sp,sn]:
            maximum_passivity=max(maximum_passivity,float(np.max(np.linalg.svd(matrix,compute_uv=False))))
            max_reciprocity=max(max_reciprocity,float(np.max(abs(matrix[:,0,1]-matrix[:,1,0]))))
        il=-db(sd[:,1,0]);rl=-db(sd[:,0,0]);ny=ch['nyquistGHz']*1e9
        key=f"{ch['name']} / {loss} / {neck} / {transition}"
        cases.append({'name':ch['name'],'lossCase':loss,'neckProxy':neck,'transitionCase':transition,
          'insertionLossAtNyquistDB':at(il,ny),'returnLossAtNyquistDB':at(rl,ny),'insertionLossAt6GHzDB':at(il,6e9),
          'minimumReturnLossThrough12GHzDB':float(np.min(rl[F<=12e9])),
          'surrogateDelayPS':[dp*1e12,dn*1e12],'surrogateSkewPS':abs(dp-dn)*1e12,
          'PCBUSBGuide4DBScreenAt10GHz':bool(at(il,10e9)<4) if ch['bus']=='USB4' else None,
          'qualified':False})
        curves[key]=(il,rl,sd)
checks.append({'name':'All reduced networks passive','maximumSingularValue':maximum_passivity,'passed':bool(maximum_passivity<1.00001)})
checks.append({'name':'All reduced networks reciprocal','maximumS12S21Difference':max_reciprocity,'passed':bool(max_reciprocity<1e-8)})

summary=[]
(OUT/'reduced-touchstone').mkdir(exist_ok=True)
for ch,geo in zip(g['channels'],geometry):
    cs=[c for c in cases if c['name']==ch['name']]
    middle=next(c for c in cs if c['lossCase']=='middle' and c['transitionCase']=='middle' and c['neckProxy']=='isolated_3mil_line')
    summary.append({**geo,'insertionLossSensitivityAtNyquistDB':[min(c['insertionLossAtNyquistDB'] for c in cs),max(c['insertionLossAtNyquistDB'] for c in cs)],
        'returnLossSensitivityAtNyquistDB':[min(c['returnLossAtNyquistDB'] for c in cs),max(c['returnLossAtNyquistDB'] for c in cs)],
        'surrogateSkewPS':middle['surrogateSkewPS'],'middleScenario':middle})
    key=f"{ch['name']} / middle / isolated_3mil_line / middle";s=curves[key][2]
    header='! Synthetic reduced PCB surrogate. NOT extracted or measured channel data.\n! Connector and package internals excluded; assumptions in results.json.\n! Component data above 6 GHz are extrapolated. No eye/BER or compliance claim.\n! Frequency-domain sensitivity only; causality is not verified.\n! Differential PCB endpoint ports, 85 ohm reference.\n# GHz S RI R 85\n'
    rows=[f"{f/1e9:.9g} "+' '.join(f"{v.real:.12g} {v.imag:.12g}" for v in [m[0,0],m[1,0],m[0,1],m[1,1]]) for f,m in zip(F,s)]
    (OUT/'reduced-touchstone'/f"{ch['name']}-surrogate.s2p").write_text(header+'\n'.join(rows)+'\n')

fig,axes=plt.subplots(1,2,figsize=(12,4.7),layout='constrained')
for ax,bus in zip(axes,['USB4','PCIe']):
    for s in summary:
        if s['bus']!=bus:continue
        vals=[v[0] for k,v in curves.items() if k.startswith(s['name']+' / ')]
        ax.fill_between(F/1e9,np.min(vals,axis=0),np.max(vals,axis=0),alpha=.12)
        key=f"{s['name']} / middle / isolated_3mil_line / middle"
        ax.plot(F/1e9,curves[key][0],label=s['name'])
    ax.axvline(6,color='black',ls=':',label='Cap data ends at 6 GHz')
    ax.axvline(10 if bus=='USB4' else 8,color='grey',ls='--',label='Nyquist')
    ax.set(xlabel='Frequency (GHz)',ylabel='Insertion loss (dB)',title=bus+' passive PCB surrogate',xlim=(.05,16),ylim=(0,12));ax.grid(alpha=.2);ax.legend(fontsize=7)
fig.suptitle('Component-aware sensitivity; package and connector internals excluded\nBands show assumed scenarios, not confidence intervals or verified bounds',fontsize=10)
fig.savefig(OUT/'channel-loss-sensitivity.png',dpi=170);plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(12,4.5),layout='constrained')
for ax,bus in zip(axes,['USB4','PCIe']):
    for s in summary:
        if s['bus']!=bus:continue
        key=f"{s['name']} / middle / isolated_3mil_line / middle"
        ax.plot(F/1e9,curves[key][1],label=s['name'])
    ax.axvline(6,color='black',ls=':');ax.set(xlabel='Frequency (GHz)',ylabel='Return loss (dB; larger is better)',title=bus+' reduced-model reflections',xlim=(.05,16),ylim=(0,45));ax.grid(alpha=.2);ax.legend(fontsize=8)
fig.suptitle('Illustrative PCB-endpoint reflection; USB4 assembly masks do not apply at these reference planes',fontsize=10)
fig.savefig(OUT/'channel-return-loss.png',dpi=170);plt.close(fig)

fig,ax=plt.subplots(figsize=(10,9),layout='constrained')
for v in g['groundVias']:
    if 32<v['x']<48 and 91<v['y']<106:
        ax.scatter(v['x'],v['y'],s=20,color='#357c46',alpha=.65)
return_reviews=[]
for ch in g['channels']:
    if ch['bus']!='USB4':continue
    for c in ch['conductors']:
        for stage in c['stages']:
            for seg in stage['segments']:
                ax.plot([seg['from']['x'],seg['to']['x']],[seg['from']['y'],seg['to']['y']],
                        color='#1c72ad' if seg['layer']=='bottom' else '#bd7731',lw=1,alpha=.7)
            for v in stage['vias']:
                near=v['nearestGroundVias'][0]
                ax.plot([v['x'],near['x']],[v['y'],near['y']],color='#7c7c7c',ls=':',lw=.8)
                if v['nearestGroundViaMm']>1:
                    ax.scatter(v['x'],v['y'],s=70,facecolors='none',edgecolors='firebrick',lw=1.5)
                    label=ch['name'].replace('USB4_','')+' '+c['polarity']+f"\n{v['nearestGroundViaMm']:.2f} mm"
                    ax.annotate(label,(v['x'],v['y']),xytext=(9,8),textcoords='offset points',fontsize=8)
                    return_reviews.append({'channel':ch['name'],'polarity':c['polarity'],'signalVia':{'x':v['x'],'y':v['y']},
                        'nearestReferenceStitchVia':{'x':near['x'],'y':near['y']},'distanceMm':v['nearestGroundViaMm'],
                        'classification':'Review trigger above assumed 1 mm proximity target; not an EM or standards failure'})
ax.scatter([],[],color='#357c46',label='GND via connecting L2 and L5')
ax.plot([],[],color='#bd7731',label='Top signal copper');ax.plot([],[],color='#1c72ad',label='Bottom signal copper')
ax.scatter([],[],s=70,facecolors='none',edgecolors='firebrick',label='Signal via >1 mm from nearest GND stitch')
ax.set(xlim=(32.8,47.5),ylim=(91.8,105.3),xlabel='Board x (mm)',ylabel='Board y (mm)',
       title='USB4 return-path proximity review\nGround connections resolved through nets and routed traces')
ax.set_aspect('equal');ax.grid(alpha=.15);ax.legend(loc='lower left',fontsize=8)
fig.savefig(OUT/'usb4-return-paths.png',dpi=170);plt.close(fig)

# Full waveforms remain arrays in a compressed NumPy artifact for reproducibility.
np.savez_compressed(OUT/'channel-curves.npz',frequency_hz=F,**{k.replace(' / ','__'):v[2] for k,v in curves.items()})
limitations=[
 'This reduced network is not a 3D extraction. A native openEMS source build and separate local-transition experiments are recorded in em3d/. Those experiments are not silently substituted into this reduced model.',
 'PCB routes, widths, capacitor inventory and pad geometry are actual emitted data. The frozen build has the same per-type elements as the earlier review; serialization order changes its file hash.',
 'Uniform cross-section results reuse the checked independent 2D solver and identical stackup. Neck values remain uniform proxies, not finite BGA escape solutions.',
 'Murata TX capacitor S-parameters end at 6 GHz. Their 1–6 GHz RL fit is extrapolated above that point. Exact 330 nF receive-capacitor data were not retrieved; it uses a same-package 220 nF proxy with changed nominal capacitance.',
 'Samsung 0402 TX capacitors now use the exact manufacturer complex series-mode S-parameters through 6 GHz. Above 6 GHz uses an RL fit. The PCB mounting fixture and Gen4 Nyquist band still require qualification.',
 'ESD is a 0.15 pF typical capacitance surrogate with 0.15 nH assumed total series loop inductance and 2 ohm assumed loss. It is not an Infineon S-parameter file. Shunt-resistor parasitics are assumed.',
 'Via impedance uses the homogeneous unshielded two-wire formula with assumed 20 um barrel plating and effective Dk 4.5, then x0.8/x1/x1.2 sensitivity. Additional 0.02/0.08/0.20 pF per leg/via is assumed. These are not extracted bounds.',
 'Signal-pad capacitance is a projected-area parallel-plate proxy with x0.5/x1/x2 sensitivity. Fringing, neighboring metal and component terminations need 3D extraction.',
 'The conductor screen preserves actual wire lengths/widths and the ordering of via transitions. Inter-via coupling, even/common-mode impedance and adjacent-channel crosstalk are not solved.',
 'P/N transfer functions are combined as independent legs using odd-mode impedances. The reported skew is a surrogate; no validated mixed-mode conversion result is claimed.',
 'Loss cases use assumed Df 0.015/0.02/0.03 and conductor multipliers 1/1.5/2, with no verified production laminate dispersion or foil roughness.',
 'Connector, BGA ball/package, die load, external cable/card and transmitter/receiver equalization models are missing. There is no valid end-to-end eye, BER or PCIe/USB4 compliance pass.',
 'ASMedia\'s 4 dB at 10 GHz routing guidance and USB4\'s informative 7.5 dB complete router-assembly recommendation have different scopes. Missing connector/package terms cannot be filled with an arbitrary allowance.',
 'USB4 assembly return-loss masks apply at TP2/TP3\' with die loading and connector included. Comparing this PCB-only S11 directly to those masks would be invalid.',
 'All case ranges are sensitivity results. Passing numeric checks validates algebra and passivity, not the physical assumptions or fabrication yield.'
 ,'Causality is not verified. Exported surrogate Touchstone files are for frequency-domain sensitivity, not qualified time-domain eye or TDR simulation.'
]
result={'sourceFile':g['sourceFile'],'sourceSha256':g['sourceSha256'],'sameElementsAsPriorReview':g['sameElementsAsPriorReview'],
  'fullChannelVerified':False,'full3DSolverRun':False,'eyeOrBERComputed':False,'crosstalkSolved':False,
  'full3DSolverRunScope':'Complete channel; separate local PCB experiments are recorded independently',
  'local3DExperiment':'em3d/review.json',
  'status':'Component-aware reduced channel sensitivity complete; assembly/channel qualification remains open',
  'geometryFile':'dist/si-channel-review/geometry.json','summary':summary,'cases':cases,'numericChecks':checks,'returnPathReviewPoints':return_reviews,
  'referenceClock':g['referenceClock'],
  'murataModel':cap_fit,'samsungModel':samsung_fit,'limitations':limitations,'missingInputs':g['unresolved'],
  'references':[
    {'title':'ASMedia routing guideline','file':'datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf','pages':'3 (USB4), 5–8 (PCIe)'},
    {'title':'USB4 specification v2, November 2025','file':'datasheets/USB4-Specification-2.0-November-2025.pdf','sections':'3.1.1.1, 3.1.3.1, 3.1.4.1'},
    {'title':'Murata exact TX capacitor model','url':'https://ds.murata.com/simserve/characteristics?ReqType=GetSparameter&partnumbers=GRM033R61E224KE01&modeltype=precise&form=series'},
    {'title':'Infineon ESD150-B1-W0201','url':'https://www.infineon.com/part/ESD150-B1-W0201'},
    {'title':'Samsung CL05B224','url':'https://product.samsungsem.com/mlcc/CL05B224KO5NNN.do'},
    {'title':'openEMS source build','url':'https://docs.openems.de/en/latest/install/clone-build-install.html'}],
  'inputSha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),ROOT/'scripts/prepare-channel-review.mjs',OUT/'geometry.json',model_file,samsung_file,curves_path,stack_file,ROOT/'dist/pcie-si/report.json',ROOT/'dist/usb4-si/report.json']}}
(OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'summary':[{k:s[k] for k in ['name','insertionLossSensitivityAtNyquistDB','returnLossSensitivityAtNyquistDB','surrogateSkewPS']} for s in summary],
                  'murataModel':cap_fit,'samsungModel':samsung_fit,'checks':checks},indent=2))
assert all(c['passed'] for c in checks)
