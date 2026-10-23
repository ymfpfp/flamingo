"""Compare local connector tapers/necks in a deliberately limited TL model.

This is a sensitivity study, not contact-aware 3D connector extraction. It does
not modify the PCB, and its scenarios are not physical uncertainty bounds.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from cross_section import Section, analyze

C0 = 299792458.

def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def line(z, er, length, f):
    theta = 2*np.pi*f*math.sqrt(er)*length*1e-3/C0
    a = np.zeros((len(f), 2, 2), complex)
    a[:, 0, 0] = a[:, 1, 1] = np.cos(theta)
    a[:, 0, 1] = 1j*z*np.sin(theta)
    a[:, 1, 0] = 1j*np.sin(theta)/z
    return a

def scattering(a):
    aa, bb, cc, dd = a[:,0,0], a[:,0,1], a[:,1,0], a[:,1,1]
    den = aa+bb/85+cc*85+dd
    return 2/den, (aa+bb/85-cc*85-dd)/den

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--board', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    board = json.loads(Path(args.board).read_text())
    stack = json.loads((ROOT/'manufacturing/stackup/selected.json').read_text())
    pads = [e for e in board if e['type']=='pcb_smtpad' and 'B27' in e.get('port_hints', [])]
    assert len(pads)==1
    pad = pads[0]
    assert abs(pad['width']-2)<1e-4 and abs(pad['height']-.7)<1e-4
    metal = stack['impedanceProfiles'][0]['calculatorGuideTraceModel']
    mask = stack['solderMaskModel']
    common = dict(height=stack['dielectrics'][0]['thicknessMm'],
                  copper=metal['outerCopperThicknessMm'],
                  top_width_reduction=metal['topWidthReductionFromBaseMm'],
                  er=stack['dielectrics'][0]['designDk'], mask_er=mask['designDk'],
                  mask_base=mask['aboveSubstrateMm'], mask_top=mask['aboveTraceMm'],
                  exterior=1.5)
    # Fixed 1 mm contact pitch. Evenly sliced tapers are compared at 8 and 16
    # longitudinal slices, with width-dependent section solves interpolated.
    widths = np.array([.09,.1234,.18,.25,.35,.50,.7])
    sections=[]
    for masked in [False,True]:
        for w in widths:
            values=[analyze(Section(**common,width=float(w),gap=1-float(w),mask=masked,step=s))
                    for s in [.002,.001]]
            sections.append({'widthMm':float(w),'mask':masked,'solves':values,
                             'meshZDifferenceOhm':values[-1]['impedance_ohm']-values[0]['impedance_ohm']})
    def props(w, masked):
        rows=[s for s in sections if s['mask']==masked]
        return tuple(float(np.interp(w,widths,[s['solves'][-1][k] for s in rows]))
                     for k in ['impedance_ohm','effective_er'])
    f=np.linspace(.1,16,1591)*1e9
    i8=int(np.argmin(abs(f-8e9))); band=f<=8e9
    def entry(kind, masked, slices=16):
        a=np.tile(np.eye(2,dtype=complex),(len(f),1,1))
        if kind=='baseline': return line(*props(.1234,True),.4,f)
        if kind=='neck_0p09': return line(*props(.09,True),.35,f) @ line(*props(.1234,True),.05,f)
        for w in .1234+(.7-.1234)*(np.arange(slices)+.5)/slices:
            a=a @ line(*props(w,masked),.4/slices,f)
        return a
    variants = {k:entry(k,m) for k,m in [('baseline',True),('neck_0p09',True),
                                                        ('masked_taper',True),('bare_taper',False)]}
    pad_z,pad_er=props(.7,False)
    rows=[]; max_power=0.; max_det=0.; max_slice_delta=0.
    for fraction in [0,.25,.5,.75,1.]:
        padnet=line(pad_z,pad_er,2*fraction,f)
        stub=np.tile(np.eye(2,dtype=complex),(len(f),1,1))
        stub[:,1,0]=1j*np.tan(2*np.pi*f*math.sqrt(pad_er)*2*(1-fraction)*1e-3/C0)/pad_z
        padnet=padnet @ stub
        # Arbitrary differential series-L sensitivity illustrates why unknown
        # contacts can reverse an apparent matching benefit. These are NOT
        # vendor values or a certified range for the connector.
        for ln in [0,.25,.5,1.,2.]:
            contact=np.tile(np.eye(2,dtype=complex),(len(f),1,1))
            contact[:,0,1]=1j*2*np.pi*f*ln*1e-9
            before21,before11=scattering(variants['baseline'] @ padnet @ contact)
            before_loss=-20*np.log10(abs(before21))
            for name,a in variants.items():
                full=a @ padnet @ contact
                s21,s11=scattering(full)
                loss=-20*np.log10(abs(s21));delta=loss-before_loss
                max_power=max(max_power,float(np.max(abs(abs(s21)**2+abs(s11)**2-1))))
                max_det=max(max_det,float(np.max(abs(np.linalg.det(full)-1))))
                rows.append({'variant':name,'contactFractionFromTraceEntry':fraction,
                             'assumedDifferentialContactSeriesL_nH':ln,
                             'lossAt8GHzDB':float(loss[i8]),'deltaLossAt8GHzDB':float(delta[i8]),
                             'worstDeltaLossTo8GHzDB':float(np.max(delta[band])),
                             'bestDeltaLossTo8GHzDB':float(np.min(delta[band])),
                             'returnLossAt8GHzDB':float(-20*np.log10(max(abs(s11[i8]),1e-14)))})
                if 'taper' in name:
                    coarse21,_=scattering(entry(name,name=='masked_taper',8) @ padnet @ contact)
                    max_slice_delta=max(max_slice_delta,float(np.max(abs(-20*np.log10(abs(coarse21))-loss)[band])))
    summary={name:{'minimumDeltaLossAt8GHzDB':min(r['deltaLossAt8GHzDB'] for r in rows if r['variant']==name),
                   'maximumDeltaLossAt8GHzDB':max(r['deltaLossAt8GHzDB'] for r in rows if r['variant']==name),
                   'scenariosWorseAt8GHz':sum(r['deltaLossAt8GHzDB']>1e-6 for r in rows if r['variant']==name)}
             for name in variants}
    result={'scope':'Lossless cascaded quasi-TEM sensitivity; no connector contacts, solder, via coupling, finite pad-edge fields or full channel eye/BER extraction.',
            'sourceSha256':digest(args.board),'stackupSha256':digest(ROOT/'manufacturing/stackup/selected.json'),
            'scriptSha256':digest(__file__),'sectionSolverSha256':digest(ROOT/'simulations/pcie-tx/cross_section.py'),
            'assumptions':{'pitchMm':1,'padLengthMm':2,'transitionLengthMm':.4,
                           'contactFractions':[0,.25,.5,.75,1],
                           'contactSeriesL_nH':[0,.25,.5,1,2],
                           'note':'Assumed scenarios, not measured values or physical bounds. Narrow neck is a diagnostic option and is not applied.'},
            'sections':sections,'summary':summary,'scenarios':rows,
            'numericalChecks':{'maximumElectrostaticResidual':max(v['relative_residual'] for s in sections for v in s['solves']),
                               'maximumMeshZDifferenceOhm':max(abs(s['meshZDifferenceOhm']) for s in sections),
                               'maximumLosslessPowerError':max_power,'maximumReciprocityDeterminantError':max_det,
                               'maximum8To16SliceLossDifferenceTo8GHzDB':max_slice_delta},
            'decision':'Do not apply a broad taper or narrow matching neck on this evidence. The pad remains manufacturer-sized; a contact-aware model or measurement is needed to choose local compensation.'}
    assert max_power<1e-10 and max_det<1e-10 and max_slice_delta<.03
    (out/'connector-options.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'summary':summary,'checks':result['numericalChecks']}))

if __name__=='__main__': main()
