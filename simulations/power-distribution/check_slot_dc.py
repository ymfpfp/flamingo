"""Conductor-only DC screen; source and drain remain distinct physical nets."""
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
from check_dc import RHO80,z,PLATING
CASES=[('V12V',[('ATX','pin10'),('ATX','pin11')],[('Q_SLOT_12V','pin'+str(p)) for p in [1,2,3]],5.5),
 ('SLOT_12V',[('Q_SLOT_12V','pin'+str(p)) for p in [5,6,7,8]],[('PCIe',p) for p in ['A2','A3','B1','B2','B3']],5.5),
 ('VCCH',[('ATX','pin'+str(p)) for p in [1,2,12,13]],[('Q_SLOT_3V3','pin'+str(p)) for p in [1,2,3]],3),
 ('SLOT_3V3',[('Q_SLOT_3V3','pin5')],[('PCIe',p) for p in ['A9','A10','B8']],3)]
def solve(raw,case,step):
 rail,feeds,loads,amps=case;j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(raw);n=nets[rail];maps={};offset=0;rows=[];cols=[];data=[]
 holes=unary_union([Point(e['x'],e['y']).buffer(e['hole_diameter']/2,quad_segs=24) for e in j if e['type'] in ['pcb_via','pcb_plated_hole'] and 'hole_diameter' in e])
 for layer,t in [('top',.035),('inner2',.0152),('inner3',.0152)]:
  pitch=step/3 if layer=='top' else step;shape=unary_union([o['shape'] for o in copper if o['net']==n and layer in o['layers']]).difference(holes);xs=np.arange(0,52.5+pitch/2,pitch);ys=np.arange(11,123.6+pitch/2,pitch);xx,yy=np.meshgrid(xs,ys);mask=contains_xy(shape.buffer(1e-8),xx,yy);index=np.full(mask.shape,-1,dtype=int);count=int(mask.sum());index[mask]=np.arange(offset,offset+count);offset+=count;maps[layer]=(index,shape,xs,ys,pitch)
  for dx,dy,factor in [(1,0,2/3),(0,1,2/3),(1,1,1/6),(-1,1,1/6)]:
   sa=(slice(max(0,dy),len(ys)+min(0,dy)),slice(max(0,dx),len(xs)+min(0,dx)));sb=(slice(max(0,-dy),len(ys)+min(0,-dy)),slice(max(0,-dx),len(xs)+min(0,-dx)));a=index[sa];b=index[sb];valid=(a>=0)&(b>=0);valid &= contains_xy(shape.buffer(1e-8),(xx[sa]+xx[sb])/2,(yy[sa]+yy[sb])/2);aa=a[valid];bb=b[valid];g=np.full(len(aa),t/RHO80*factor);rows.extend([aa,bb,aa,bb]);cols.extend([bb,aa,aa,bb]);data.extend([-g,-g,g,g])
 def node(layer,x,y):
  index,shape,xs,ys,pitch=maps[layer];ix=round((x-xs[0])/pitch);iy=round((y-ys[0])/pitch);near=[]
  for ry in range(max(0,iy-2),min(len(ys),iy+3)):
   for rx in range(max(0,ix-2),min(len(xs),ix+3)):
    if index[ry,rx]>=0:near.append((math.hypot(xs[rx]-x,ys[ry]-y),index[ry,rx]))
  if not near or min(near)[0]>pitch*1.6:return None
  return int(min(near)[1])
 for v in vias.values():
  if via_net(v)!=n:continue
  radius=(v['hole_diameter']+v['outer_diameter'])/4
  for dx,dy in [(radius,0),(-radius,0),(0,radius),(0,-radius)]:
   touching=[(l,node(l,v['x']+dx,v['y']+dy)) for l in maps if l in v['layers']];touching=[(l,a) for l,a in touching if a is not None]
   for (first,a),(last,b) in zip(touching,touching[1:]):
    g=math.pi*(v['hole_diameter']+PLATING)*PLATING/(RHO80*(z[last]-z[first]))/4;rows.append(np.array([a,b,a,b]));cols.append(np.array([b,a,a,b]));data.append(np.array([-g,-g,g,g]))
 matrix=coo_matrix((np.concatenate(data),(np.concatenate(rows),np.concatenate(cols))),shape=(offset,offset)).tocsr()
 def patch_nodes(layer,p):
  shape=next(o['shape'] for o in copper if o['port']==p['pcb_port_id']);index,_,xs,ys,_=maps[layer];xx,yy=np.meshgrid(xs,ys);found=index[contains_xy(shape,xx,yy)];return found[found>=0]
 fixed=[]
 for part,pin in feeds:
  p=port(part,pin)
  for l in maps:
   if l in p['layers']:fixed.extend(patch_nodes(l,p))
 fixed=np.unique(fixed);labels=connected_components(matrix,directed=False,return_labels=True)[1];active=np.isin(labels,np.unique(labels[fixed]));free=active.copy();free[fixed]=False;current=np.zeros(offset);loadNodes={}
 for part,pin in loads:
  found=patch_nodes('top',port(part,pin))
  if not len(found) or not active[found].all():raise ValueError(rail+': disconnected mesh load '+part+'.'+pin)
  current[found]-=amps/len(loads)/len(found);loadNodes[part+'.'+pin]=found
 voltage=np.zeros(offset);voltage[free]=spsolve(matrix[free][:,free],current[free]);drops={name:float(-voltage[nodes].min()*1000) for name,nodes in loadNodes.items()}
 return dict(gridMm=step,meshNodes=int(active.sum()),dropMV=max(drops.values()),terminalsMV=drops)
if __name__=='__main__':
 file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw);results=[]
 for case in CASES:
  coarse=solve(j,case,.2);fine=solve(j,case,.12);bound=max(coarse['dropMV'],fine['dropMV'])+max(abs(coarse['dropMV']-fine['dropMV']),.25*fine['dropMV']);results.append(dict(rail=case[0],currentA=case[3],coarse=coarse,fine=fine,withMeshAllowanceMV=bound));print(case[0],round(fine['dropMV'],3),'mV; allowance',round(bound,3),'mV',flush=True)
 by={r['rail']:r for r in results};channels=[]
 for suffix,source,output,amps,rds in [('12V','V12V','SLOT_12V',5.5,.013),('3V3','VCCH','SLOT_3V3',3,.0098)]:
  conductor=by[source]['withMeshAllowanceMV']+by[output]['withMeshAllowanceMV'];channels.append(dict(rail=suffix,currentA=amps,conductorUpperDropMV=conductor,mosfetDrop25CMaxRdsMV=amps*rds*1000,mosfetDissipation25CMaxRdsW=amps*amps*rds))
 report=dict(status='screen-completed; qualification-open',results=results,channels=channels,copperTemperatureC=80,viaPlatingAssumedMm=PLATING,sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest(),scope='Actual top/L3/L4 copper and via barrels; equal current per physical switch-source pad and slot-power contact. Input and output solved separately; MOSFET 25 C maximum-Rds loss stated separately. Assumed 5.5 A / 3 A individual rail envelopes are not simultaneous permission to exceed the 75 W combined card budget.',limitations='No voltage pass/fail inferred from unknown ATX source/cable loss or unknown bridge VCCH consumption. No ground-return, package lead resistance, hot MOSFET, thermal, startup, fault, AC or SOA qualification; fixed source voltages and equal pad currents are model assumptions.')
 (ROOT/'dist/slot-power-routing/dc-audit.json').write_text(json.dumps(report,indent=2))
