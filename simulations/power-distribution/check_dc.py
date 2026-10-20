"""DC resistance screen of emitted top copper, power regions and plated vias.

This is a resistive sheet mesh, not a field solver or a regulator/AC-PDN model.
"""
import hashlib,json,math,sys
from pathlib import Path
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import spsolve
from shapely import contains_xy
from shapely.geometry import Point
from shapely.ops import unary_union
from check_layout import model,ROOT

RHO20=1.724e-5  # ohm mm
RHO80=RHO20*(1+.00393*60)
CURRENT=3
PLATING=.020  # Explicit assumed minimum; require vendor confirmation.
STACK=json.loads((ROOT/'manufacturing/stackup/JLC06161H-3313.json').read_text())
z={};depth=0
for i,layer in enumerate(STACK['copperLayers']):
    depth+=layer['thicknessMm']/2;z[layer['tscircuitLayer']]=depth;depth+=layer['thicknessMm']/2
    if i<len(STACK['dielectrics']):depth+=STACK['dielectrics'][i]['thicknessMm']

def solve(j,rail,step):
    j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(j)
    net=nets[rail]
    planes=[l for l in ['inner2','inner3'] if any(o['net']==net and l in o['layers'] and o['label'] in pours for o in copper)]
    maps={};offset=0;row=[];col=[];data=[]
    for layer,t in [('top',.035)]+[(p,.0152) for p in planes]:
        pitch=step/3 if layer=='top' else step
        xs=np.arange(0,46.5+pitch/2,pitch);ys=np.arange(69.5,114.5+pitch/2,pitch)
        xx,yy=np.meshgrid(xs,ys)
        shapes=[o['shape'] for o in copper if o['net']==net and layer in o['layers']]
        # Plated via lands exist on every traversed copper layer. Include them
        # so a via near a pour edge has its real contact area in the mesh.
        if layer!='top':shapes +=[Point(v['x'],v['y']).buffer(v['outer_diameter']/2) for v in vias.values() if via_net(v)==net and layer in v['layers']]
        shape=unary_union(shapes)
        mask=contains_xy(shape.buffer(1e-8),xx,yy);index=np.full(mask.shape,-1,dtype=int)
        count=int(mask.sum());index[mask]=np.arange(offset,offset+count);offset+=count;maps[layer]=(index,shape,xs,ys,pitch)
        for dx,dy,factor in [(1,0,2/3),(0,1,2/3),(1,1,1/6),(-1,1,1/6)]:
            sa=(slice(max(0,dy),len(ys)+min(0,dy)),slice(max(0,dx),len(xs)+min(0,dx)))
            sb=(slice(max(0,-dy),len(ys)+min(0,-dy)),slice(max(0,-dx),len(xs)+min(0,-dx)))
            a=index[sa];b=index[sb];valid=(a>=0)&(b>=0)
            mx=(xx[sa]+xx[sb])/2;my=(yy[sa]+yy[sb])/2
            valid &=contains_xy(shape.buffer(1e-8),mx,my)
            aa=a[valid];bb=b[valid];g=np.full(len(aa),t/RHO80*factor)
            row.extend([aa,bb,aa,bb]);col.extend([bb,aa,aa,bb]);data.extend([-g,-g,g,g])
    def node(layer,p):
        index,shape,xs,ys,pitch=maps[layer];ix=int(round((p['x']-xs[0])/pitch));iy=int(round((p['y']-ys[0])/pitch))
        candidates=[]
        for ry in range(max(0,iy-2),min(len(ys),iy+3)):
            for rx in range(max(0,ix-2),min(len(xs),ix+3)):
                if index[ry,rx]>=0:candidates.append((math.hypot(xs[rx]-p['x'],ys[ry]-p['y']),index[ry,rx]))
        if not candidates:raise ValueError(f'{rail}: no mesh contact at {p}')
        distance,n=min(candidates)
        if distance>pitch*1.5:raise ValueError(f'{rail}: mesh contact too far from terminal ({distance})')
        return int(n)
    for v in vias.values():
        if via_net(v)!=net:continue
        traversed=[l for l in ['top']+planes if l in v['layers']]
        for first,last in zip(traversed,traversed[1:]):
            a=node(first,v);b=node(last,v)
            area=math.pi*(v['hole_diameter']+PLATING)*PLATING
            g=area/(RHO80*(z[last]-z[first]))
            row.extend([np.array([a,b,a,b])]);col.extend([np.array([b,a,a,b])]);data.extend([np.array([-g,-g,g,g])])
    a=coo_matrix((np.concatenate(data),(np.concatenate(row),np.concatenate(col))),shape=(offset,offset)).tocsr()
    feed=port('L_'+rail,'pin2');feed_shape=next(o['shape'] for o in copper if o['port']==feed['pcb_port_id'])
    index,shape,xs,ys,pitch=maps['top'];xx,yy=np.meshgrid(xs,ys)
    fixed=maps['top'][0][contains_xy(feed_shape,xx,yy)];fixed=fixed[fixed>=0]
    if not len(fixed):raise ValueError('No output source contact')
    labels=connected_components(a,directed=False,return_labels=True)[1];active=labels==labels[fixed[0]]
    fixed=np.unique(fixed[active[fixed]]);free=active.copy();free[fixed]=False
    bridge=[]
    for p in pp.values():
        s=sp.get(p.get('source_port_id'),{})
        if sc.get(s.get('source_component_id'),{}).get('name')=='ASM2464PDX' and rail in s.get('port_hints',[]):bridge.append((s['port_hints'][-1],node('top',p)))
    missing=[name for name,n in bridge if not active[n]]
    if missing:raise ValueError(f'{rail}: mesh disconnect at {missing}; refine the mesh')
    current=np.zeros(offset)
    for name,n in bridge:current[n]-=CURRENT/len(bridge)
    voltage=np.zeros(offset);voltage[free]=spsolve(a[free][:,free],current[free])
    # The divider samples the output capacitor. Its DC current is omitted.
    feedback=node('top',port('C_'+rail+'_COUT_B','pin1'));reference=voltage[feedback]
    drops=[{'ball':name,'dropMV':float((reference-voltage[n])*1000)} for name,n in bridge]
    via_drops=[{'via':st.get(v.get('source_trace_id'),{}).get('display_name',v['pcb_via_id']),
        'x':v['x'],'y':v['y'],'dropMV':{l:float((reference-voltage[node(l,v)])*1000) for l in ['top']+planes}}
        for v in vias.values() if via_net(v)==net and 93<v['y']<103]
    return {'rail':rail,'layers':['top']+planes,'gridMm':step,'meshNodes':int(active.sum()),'maximumDropMV':max(d['dropMV'] for d in drops),
        'minimumDropMV':min(d['dropMV'] for d in drops),'balls':drops,'viaDrops':via_drops}

if __name__=='__main__':
    file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw);results=[];failures=[]
    for rail in ['VCCL','VDD']:
        coarse=solve(j,rail,.15);fine=solve(j,rail,.1)
        difference=abs(fine['maximumDropMV']-coarse['maximumDropMV'])
        # Reserve at least 20 percent for discretization/contact approximation.
        bound=max(fine['maximumDropMV'],coarse['maximumDropMV'])+max(difference,.2*fine['maximumDropMV'])
        results.append({'rail':rail,'currentA':CURRENT,'copperTemperatureC':80,'coarse':coarse,'fine':fine,'screeningUpperDropMV':bound})
        if bound>8:failures.append(f'{rail}: resistive conductor screen exceeds the 8 mV project budget at 3 A / 80 C')
        print(rail,'3 A / 80 C conductor drop:',round(fine['maximumDropMV'],3),'mV; mesh allowance:',round(bound,3),'mV')
    report={'passed':not failures,'failures':failures,'results':results,'viaPlatingAssumedMm':PLATING,
        'sourceFile':str(file),'sourceSha256':hashlib.sha256(raw).hexdigest(),
        'scope':'Top copper, assigned power region and parallel plated feed/contact vias. Equal current per bridge supply ball; regulator feedback sampled at the output capacitor.',
        'limitations':'DC screening only. Plating thickness is an assumption pending vendor confirmation. Ground return, package/inductor losses, unequal internal ball loading, AC PDN impedance, ripple, transients, startup and thermal performance remain separate qualification.'}
    (ROOT/'dist/power-distribution/dc-audit.json').write_text(json.dumps(report,indent=2))
    for f in failures:print(f)
    sys.exit(0 if report['passed'] else 1)
