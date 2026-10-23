"""Resistive sheet screen of the ATX 5 V feed; no routing or thermal model."""
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
from check_dc import RHO80,z,PLATING,STACK

def solve(raw,step):
    j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(raw)
    net=nets['V5V'];maps={};offset=0;rows=[];cols=[];data=[]
    # Remove real drill openings from the conductive sheets. Via barrels join
    # the two annuli through four distributed contacts, rather than a hole node.
    holes=unary_union([Point(e['x'],e['y']).buffer(e['hole_diameter']/2,quad_segs=24)
        for e in j if e['type'] in ['pcb_via','pcb_plated_hole'] and 'hole_diameter' in e])
    layer_copper={l['tscircuitLayer']:l['thicknessMm'] for l in STACK['copperLayers']}
    for layer,thickness in [('top',layer_copper['top']),('inner3',layer_copper['inner3'])]:
        pitch=step/3 if layer=='top' else step
        xs=np.arange(0,52.5+pitch/2,pitch);ys=np.arange(11,78+pitch/2,pitch);xx,yy=np.meshgrid(xs,ys)
        shape=unary_union([o['shape'] for o in copper if o['net']==net and layer in o['layers']]).difference(holes)
        mask=contains_xy(shape.buffer(1e-8),xx,yy);index=np.full(mask.shape,-1,dtype=int)
        count=int(mask.sum());index[mask]=np.arange(offset,offset+count);offset+=count
        maps[layer]=(index,shape,xs,ys,pitch)
        for dx,dy,factor in [(1,0,2/3),(0,1,2/3),(1,1,1/6),(-1,1,1/6)]:
            sa=(slice(max(0,dy),len(ys)+min(0,dy)),slice(max(0,dx),len(xs)+min(0,dx)))
            sb=(slice(max(0,-dy),len(ys)+min(0,-dy)),slice(max(0,-dx),len(xs)+min(0,-dx)))
            a=index[sa];b=index[sb];valid=(a>=0)&(b>=0)
            valid &=contains_xy(shape.buffer(1e-8),(xx[sa]+xx[sb])/2,(yy[sa]+yy[sb])/2)
            aa=a[valid];bb=b[valid];g=np.full(len(aa),thickness/RHO80*factor)
            rows.extend([aa,bb,aa,bb]);cols.extend([bb,aa,aa,bb]);data.extend([-g,-g,g,g])
    def node(layer,x,y):
        index,shape,xs,ys,pitch=maps[layer];ix=int(round((x-xs[0])/pitch));iy=int(round((y-ys[0])/pitch));candidates=[]
        for ry in range(max(0,iy-2),min(len(ys),iy+3)):
            for rx in range(max(0,ix-2),min(len(xs),ix+3)):
                if index[ry,rx]>=0:candidates.append((math.hypot(xs[rx]-x,ys[ry]-y),index[ry,rx]))
        if not candidates or min(candidates)[0]>pitch*1.6:raise ValueError(f'No 5 V mesh contact on {layer} at {(x,y)}')
        return int(min(candidates)[1])
    for v in vias.values():
        if via_net(v)!=net:continue
        radius=(v['hole_diameter']+v['outer_diameter'])/4
        conductance=math.pi*(v['hole_diameter']+PLATING)*PLATING/(RHO80*(z['inner3']-z['top']))/4
        for dx,dy in [(radius,0),(-radius,0),(0,radius),(0,-radius)]:
            a=node('top',v['x']+dx,v['y']+dy);b=node('inner3',v['x']+dx,v['y']+dy)
            rows.append(np.array([a,b,a,b]));cols.append(np.array([b,a,a,b]));data.append(np.array([-conductance,-conductance,conductance,conductance]))
    matrix=coo_matrix((np.concatenate(data),(np.concatenate(rows),np.concatenate(cols))),shape=(offset,offset)).tocsr()
    def patch_nodes(layer,shape):
        index,_,xs,ys,_=maps[layer];xx,yy=np.meshgrid(xs,ys)
        found=index[contains_xy(shape,xx,yy)];return found[found>=0]
    fixed=[]
    for pin in [4,6,21,22,23]:
        p=port('ATX','pin'+str(pin));pad=next(o['shape'] for o in copper if o['port']==p['pcb_port_id'])
        for layer in ['top','inner3']:fixed.extend(patch_nodes(layer,pad))
    fixed=np.unique(fixed);labels=connected_components(matrix,directed=False,return_labels=True)[1]
    active=np.isin(labels,np.unique(labels[fixed]));free=active.copy();free[fixed]=False
    current=np.zeros(offset);loads={}
    for rail in ['VCCL','VDD']:
        p=port(rail+'_BUCK','VIN');pad=next(o['shape'] for o in copper if o['port']==p['pcb_port_id'])
        load=patch_nodes('top',pad)
        if not len(load) or not active[load].all():raise ValueError(rail+': disconnected VIN in the 5 V sheet mesh')
        current[load]-=2/len(load);loads[rail]=load
    voltage=np.zeros(offset);voltage[free]=spsolve(matrix[free][:,free],current[free])
    return dict(gridMm=step,meshNodes=int(active.sum()),dropAtVinMV={r:float(-voltage[load].min()*1000) for r,load in loads.items()})

if __name__=='__main__':
    file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw)
    coarse=solve(j,.2);fine=solve(j,.12);results=[]
    for rail in ['VCCL','VDD']:
        a=coarse['dropAtVinMV'][rail];b=fine['dropAtVinMV'][rail]
        bound=max(a,b)+max(abs(a-b),.25*b)
        results.append(dict(rail=rail,inputCurrentA=2,conductorDropMV=b,withMeshAllowanceMV=bound,passed=bound<=100))
    result=dict(passed=all(r['passed'] for r in results),results=results,coarse=coarse,fine=fine,
        combinedInputCurrentA=4,copperTemperatureC=80,viaPlatingAssumedMm=PLATING,targetMV=100,
        sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest(),
        scope='Emitted top and L4 copper, real drill openings, four parallel power-via barrels and both local VIN loops. Five ATX 5 V pad annuli form the source boundary; each VIN draws 2 A.',
        limitations='Project sizing screen, not an ASMedia load specification. No connector/cable, ground-return, package, AC, thermal, startup or fault model. Via plating remains a fabrication assumption.')
    out=ROOT/'dist/atx5v-routing';out.mkdir(parents=True,exist_ok=True);(out/'dc-audit.json').write_text(json.dumps(result,indent=2))
    for r in results:print(r['rail'],'5 V input drop:',round(r['conductorDropMV'],3),'mV; with mesh allowance:',round(r['withMeshAllowanceMV'],3),'mV')
    sys.exit(0 if result['passed'] else 1)
