"""Independent quasi-static cross-section screen; not a 3D SI/compliance solver.

Solve div(epsilon grad V)=0 on a node-centered finite-volume mesh. Odd symmetry
puts the pair center at 0 V, the positive trace at +0.5 V and its image at -0.5 V.
Two solves (actual dielectric and vacuum) give differential capacitances C, C0.
Zdiff = 1/(c*sqrt(C*C0)), epsilon_eff=C/C0. Finite metal thickness, an optional
trapezoid and a stepped solder mask are represented explicitly. Copper is PEC.
The open exterior is approximated by distant grounded boundaries; check size
and mesh convergence. Bends, vias, losses, dispersion and adjacent nets are absent.
"""
from dataclasses import dataclass, asdict
import math
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve

EPS0 = 8.8541878128e-12
C0 = 299792458.0

@dataclass(frozen=True)
class Section:
    width: float = 0.1234
    gap: float = 0.1001
    height: float = 0.0994
    copper: float = 0.04064
    top_width_reduction: float = 0.01778
    er: float = 4.1
    mask_er: float = 3.8
    mask_base: float = 0.03048
    mask_top: float = 0.01524
    mask: bool = True
    single: bool = False
    homogeneous: bool = False
    step: float = 0.001
    exterior: float = 1.2

def axis(features, fine_max, end, step):
    features=sorted(set([0., fine_max]+[float(v) for v in features if 0<v<fine_max]))
    a=[]
    for lo,hi in zip(features[:-1],features[1:]):
        a.extend(np.linspace(lo,hi,math.ceil((hi-lo)/step)+1)[:-1])
    a.append(fine_max)
    dx=step
    while a[-1]<end:
        dx=min(dx*1.12,0.06)
        a.append(min(end,a[-1]+dx))
    return np.array(a)

def solve(section: Section, vacuum=False, keep_field=False):
    s=section
    left=0 if s.single else s.gap/2
    right=s.width/2 if s.single else left+s.width
    fine_x=right+0.1
    fine_y=s.height+max(s.copper+s.mask_top,s.mask_base)+0.08
    x=axis([left,right,left+s.top_width_reduction/2,right-s.top_width_reduction/2],fine_x,right+s.exterior,s.step)
    y=axis([s.height,s.height+s.copper,s.height+s.mask_base,s.height+s.copper+s.mask_top],fine_y,s.height+s.exterior,s.step)
    xx,yy=np.meshgrid(x,y)
    taper=np.clip((yy-s.height)/s.copper,0,1)*s.top_width_reduction/2 if s.copper>0 else np.zeros_like(yy)
    metal=(yy>=s.height-1e-10)&(yy<=s.height+s.copper+1e-10)&(xx>=left+taper-1e-10)&(xx<=right-taper+1e-10)
    if s.single:
        metal=(yy>=s.height-1e-10)&(yy<=s.height+s.copper+1e-10)&(xx<=right-taper+1e-10)
    def dielectric(xp,yp):
        if vacuum:return np.ones(np.broadcast_shapes(xp.shape,yp.shape))
        if s.homogeneous:return np.full(np.broadcast_shapes(xp.shape,yp.shape),s.er)
        e=np.where(yp<=s.height,s.er,1.)+np.zeros_like(xp)
        if s.mask:
            mask_limit=np.where((xp>=left)&(xp<=right),s.copper+s.mask_top,s.mask_base)
            e=np.where((yp>s.height)&(yp<=s.height+mask_limit),s.mask_er,e)
        return e
    hx=np.diff(x);hy=np.diff(y)
    dx=np.r_[hx[0]/2,(hx[:-1]+hx[1:])/2,hx[-1]/2]
    dy=np.r_[hy[0]/2,(hy[:-1]+hy[1:])/2,hy[-1]/2]
    # Face conductance epsilon * face length / node distance. Quarter-cell
    # quadrature averages dielectric interfaces on faces that straddle layers.
    xm=(x[:-1]+x[1:])/2
    ym=(y[:-1]+y[1:])/2
    ex=(dielectric(xm[None,:],(y-dy/4)[:,None])+dielectric(xm[None,:],(y+dy/4)[:,None]))/2
    ey=(dielectric((x-dx/4)[None,:],ym[:,None])+dielectric((x+dx/4)[None,:],ym[:,None]))/2
    gx=ex*dy[:,None]/hx[None,:]
    gy=ey*dx[None,:]/hy[:,None]
    ny,nx=xx.shape
    ids=np.arange(nx*ny).reshape(ny,nx)
    ia=np.r_[ids[:,:-1].ravel(),ids[:-1,:].ravel()]
    ib=np.r_[ids[:,1:].ravel(),ids[1:,:].ravel()]
    conductance=np.r_[gx.ravel(),gy.ravel()]
    fixed=np.zeros((ny,nx),dtype=bool)
    fixed[0,:]=True;fixed[-1,:]=True;fixed[:,-1]=True
    if not s.single:fixed[:,0]=True
    fixed|=metal
    v=np.zeros(nx*ny)
    v[metal.ravel()]=1. if s.single else .5
    free=np.flatnonzero(~fixed.ravel())
    index=np.full(nx*ny,-1);index[free]=np.arange(len(free))
    diag=np.bincount(np.r_[ia,ib],weights=np.r_[conductance,conductance],minlength=nx*ny)[free]
    aa=index[ia];bb=index[ib]
    both=(aa>=0)&(bb>=0)
    rows=np.r_[np.arange(len(free)),aa[both],bb[both]]
    cols=np.r_[np.arange(len(free)),bb[both],aa[both]]
    vals=np.r_[diag,-conductance[both],-conductance[both]]
    rhs=np.zeros(len(free))
    q=(aa>=0)&(bb<0);np.add.at(rhs,aa[q],conductance[q]*v[ib[q]])
    q=(bb>=0)&(aa<0);np.add.at(rhs,bb[q],conductance[q]*v[ia[q]])
    mat=coo_matrix((vals,(rows,cols)),shape=(len(free),len(free))).tocsc()
    v[free]=spsolve(mat,rhs)
    residual=np.max(np.abs(mat@v[free]-rhs))/max(np.max(np.abs(rhs)),1e-15)
    # sum(g*dV^2) is twice the electrostatic energy of the half-domain.
    # Double for the physical full-domain, with differential excitation = 1 V.
    cap=2*EPS0*np.sum(conductance*(v[ia]-v[ib])**2)
    result={'capacitance_F_per_m':float(cap),'nodes':int(nx*ny),'relative_residual':float(residual)}
    if keep_field:result.update(x=x,y=y,potential=v.reshape(ny,nx),metal=metal)
    return result

def analyze(section: Section, keep_field=False):
    a=solve(section,keep_field=keep_field);b=solve(section,vacuum=True)
    z=1/(C0*math.sqrt(a['capacitance_F_per_m']*b['capacitance_F_per_m']))
    r={'inputs':asdict(section),'impedance_ohm':z,'effective_er':a['capacitance_F_per_m']/b['capacitance_F_per_m'],
       'capacitance_F_per_m':a['capacitance_F_per_m'],'vacuum_capacitance_F_per_m':b['capacitance_F_per_m'],
       'inductance_H_per_m':1/(C0*C0*b['capacitance_F_per_m']),
       'nodes':a['nodes'],'relative_residual':max(a['relative_residual'],b['relative_residual'])}
    if keep_field:r['field']=a
    return r

def hammerstad_single(width,height,er):
    u=width/height
    a=1+math.log((u**4+(u/52)**2)/(u**4+0.432))/49+math.log(1+(u/18.1)**3)/18.7
    b=0.564*((er-.9)/(er+3))**.053
    ee=(er+1)/2+(er-1)/2*(1+10/u)**(-a*b)
    f=6+(2*math.pi-6)*math.exp(-(30.666/u)**.7528)
    z=376.730313668/(2*math.pi)*math.log(f/u+math.sqrt(1+(2/u)**2))/math.sqrt(ee)
    return z

if __name__=='__main__':
    import json,time
    start=time.time()
    for step in [.004,.002,.001]:
        r=analyze(Section(step=step));print(step, r['impedance_ohm'],r['effective_er'],r['nodes'],time.time()-start,flush=True)
    b=Section(width=.2,height=.1,copper=0,top_width_reduction=0,mask=False,single=True,step=.001,exterior=2.)
    r=analyze(b);print('single benchmark',r['impedance_ohm'],hammerstad_single(.2,.1,4.1),flush=True)
