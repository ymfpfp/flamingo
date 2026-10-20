"""Verify GND/GNDA pads, all PCB ports and all via barrels reach L2 and L5."""
import copy,hashlib,json,sys
from pathlib import Path
from shapely.geometry import Point,LineString
from shapely.ops import unary_union
from check_layout import model,ROOT
LAYERS=['top','inner1','inner2','inner3','inner4','bottom']

def audit(raw):
 j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(raw);failures=[]
 specs=json.loads((ROOT/'manufacturing/ground-returns/specs.json').read_text())
 terminals=json.loads((ROOT/'manufacturing/ground-returns/terminals.json').read_text())
 n=nets['GND'];regions=[]
 for layer in LAYERS:
  geom=unary_union([o['shape'] for o in copper if o['net']==n and layer in o['layers']]).buffer(1e-7)
  regions.extend((layer,g) for g in getattr(geom,'geoms',[geom]) if not g.is_empty)
 parent=list(range(len(regions)))
 def find(i):
  if parent[i]!=i:parent[i]=find(parent[i])
  return parent[i]
 barrels=[(v['x'],v['y'],v['layers']) for v in vias.values() if via_net(v)==n]
 # A port can own several separate plated lands (USB-C shield slots). Join
 # layers at each actual plated hole, never at an averaged logical port point.
 barrels +=[(h['x'],h['y'],h['layers']) for h in j if h['type']=='pcb_plated_hole' and h.get('pcb_port_id') in pp and root(pp[h['pcb_port_id']].get('source_port_id',''))==n]
 for x,y,layers in barrels:
  touching=[i for i,(l,g) in enumerate(regions) if l in layers and g.covers(Point(x,y))]
  for i in touching[1:]:parent[find(i)]=find(touching[0])
 refs={layer:{find(i) for i,(l,g) in enumerate(regions) if l==layer and g.area>100} for layer in ['inner1','inner4']}
 assembled={e['source_component_id'] for e in j if e['type']=='pcb_component' and e.get('source_component_id') in sc}
 all_ground=[];all_ports=[]
 analog_nets={e['source_net_id'] for e in j if e['type']=='source_net' and e.get('name')=='GNDA'}
 analog_ports={pid for t in st.values() if analog_nets.intersection(t.get('connected_source_net_ids',[])) for pid in t['connected_source_port_ids']}
 if nets.get('GNDA')!=n:failures.append('GNDA must retain its reference-design connection to GND')
 for p in pp.values():
  s=sp.get(p.get('source_port_id'),{})
  if root(p.get('source_port_id',''))!=n:continue
  assembled_pad=s.get('source_component_id') in assembled
  name=sc[s['source_component_id']]['name']+'.'+s['port_hints'][-1] if assembled_pad else p['pcb_port_id']
  contact={find(i) for i,(l,g) in enumerate(regions) if l in p['layers'] and g.covers(Point(p['x'],p['y']))}
  row={'name':name,'portId':p['pcb_port_id'],'net':'GNDA' if p.get('source_port_id') in analog_ports else 'GND','connectedL2':bool(contact&refs['inner1']),'connectedL5':bool(contact&refs['inner4'])};all_ports.append(row)
  if assembled_pad:all_ground.append(row)
  if not(row['connectedL2'] and row['connectedL5']):failures.append(name+': no physical path to both GND reference planes')
 if len(all_ground)!=286:failures.append('Assembled ground-pad inventory changed: '+str(len(all_ground)))
 all_vias=[]
 for v in vias.values():
  if via_net(v)!=n:continue
  point=Point(v['x'],v['y']);contact={find(i) for i,(l,g) in enumerate(regions) if l in v['layers'] and g.covers(point)}
  row={'viaId':v['pcb_via_id'],'x':v['x'],'y':v['y'],'connectedL2':bool(contact&refs['inner1']),'connectedL5':bool(contact&refs['inner4'])};all_vias.append(row)
  if not(row['connectedL2'] and row['connectedL5']):failures.append(v['pcb_via_id']+': floating ground via, no physical path to both reference planes')
 all_lands=[]
 ground_port_ids={r['portId'] for r in all_ground}
 for o in copper:
  if o['port'] not in ground_port_ids:continue
  contact={find(i) for i,(l,g) in enumerate(regions) if l in o['layers'] and g.intersects(o['shape'])}
  row={'name':o['label'],'portId':o['port'],'connectedL2':bool(contact&refs['inner1']),'connectedL5':bool(contact&refs['inner4'])};all_lands.append(row)
  if not(row['connectedL2'] and row['connectedL5']):failures.append(o['label']+': individual copper land does not reach both reference planes')
 if len(all_lands)!=288:failures.append('Physical ground copper-land inventory changed: '+str(len(all_lands)))
 contacts=[]
 for spec in specs:
  ts=[t for t in j if t['type']=='pcb_trace' and st.get(t.get('source_trace_id'),{}).get('name')==spec['name']]
  if len(ts)!=1:failures.append(spec['name']+': missing ground contact');continue
  t=ts[0];source=st[t['source_trace_id']]
  if any(root(pid)!=n for pid in source['connected_source_port_ids']):failures.append(spec['name']+': not wholly connected to GND')
  wires=[o['shape'] for o in copper if o['trace']==t['pcb_trace_id'] and 'top' in o['layers']]
  shape=unary_union(wires)
  foreign=[o for o in copper if o['net']!=n and 'top' in o['layers']]
  gap=min((shape.distance(o['shape']) for o in foreign),default=999)
  length=sum(LineString([(a['x'],a['y']),(b['x'],b['y'])]).length for a,b in zip(t['route'],t['route'][1:]))
  if gap<.1-1e-5:failures.append(spec['name']+f': top copper gap {gap:.6f} mm < 0.1 mm')
  if length>2+1e-5:failures.append(spec['name']+': exceeds project 2 mm return-locality target')
  contacts.append({'name':spec['name'],'lengthMm':length,'minimumForeignTopCopperGapMm':gap,'widthMm':min(q['width'] for q in t['route'])})
 via_rows=[]
 for terminal in terminals:
  found=[v for v in vias.values() if abs(v['x']-terminal['x'])<1e-5 and abs(v['y']-terminal['y'])<1e-5]
  if len(found)!=1:failures.append(terminal['name']+': missing full-stack ground barrel');continue
  v=found[0]
  if via_net(v)!=n:failures.append(terminal['name']+': barrel has wrong net')
  if terminal.get('existing'):continue
  point=Point(v['x'],v['y']);drill=point.buffer(v['hole_diameter']/2,quad_segs=64)
  # Foreign inner wire and plane copper must clear the actual drill. The
  # surface annulus clearance is checked separately by native fabrication DRC.
  inner=[o for o in copper if o['net']!=n and any(l in o['layers'] for l in LAYERS[1:-1])]
  gap=min((drill.distance(o['shape']) for o in inner),default=999)
  if gap<.2-1e-5:failures.append(terminal['name']+f': inner drill-to-copper gap {gap:.6f} mm < 0.2 mm')
  for layer in ['inner1','inner4']:
   if not any(l==layer and find(i) in refs[layer] and g.covers(point) for i,(l,g) in enumerate(regions)):failures.append(terminal['name']+': no direct '+layer+' plane contact')
  via_rows.append({'name':terminal['name'],'minimumForeignInnerDrillToCopperMm':gap})
 return {'passed':not failures,'failures':failures,'groundPadsChecked':len(all_ground),'analogGroundPadsChecked':sum(r['net']=='GNDA' for r in all_ground),'physicalGroundLandsChecked':len(all_lands),'allGroundPortsChecked':len(all_ports),'groundViasChecked':len(all_vias),'disconnectedGroundPads':[r for r in all_ground if not(r['connectedL2'] and r['connectedL5'])],'disconnectedGroundPorts':[r for r in all_ports if not(r['connectedL2'] and r['connectedL5'])],'disconnectedGroundVias':[r for r in all_vias if not(r['connectedL2'] and r['connectedL5'])],'allGroundPads':all_ground,'allGroundVias':all_vias,'allGroundLands':all_lands,'completedContacts':contacts,'newViaChecks':via_rows,'scope':'Actual emitted copper and plated barrels: every GND/GNDA PCB port, every individual assembled copper land, and every ground via must reach both L2/L5 planes. Separate holes sharing one port are checked individually.'}

if __name__=='__main__':
 file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw);result=audit(j);result.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest())
 out=ROOT/'dist/ground-returns';out.mkdir(parents=True,exist_ok=True);(out/'layout-audit.json').write_text(json.dumps(result,indent=2));print('All assembled ground returns:',result['passed'])
 for f in result['failures']:print(f)
 if '--self-test' in sys.argv and result['passed']:
  bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
  ids={t['source_trace_id'] for t in bad if t['type']=='source_trace' and t.get('name')=='GRET_R_RST_N_CONTACT'}
  bad=[e for e in bad if not(e['type']=='pcb_trace' and e.get('source_trace_id') in ids)];negative=audit(bad)
  assert any(r['name']=='R_RST_N.2' for r in negative['disconnectedGroundPads']),'Severed support return did not disconnect its pad physically'
  bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
  terminal=next(t for t in json.loads((ROOT/'manufacturing/ground-returns/terminals.json').read_text()) if t['name']=='GRET_W25Q32JVSSIQ')
  bad=[e for e in bad if not(e['type']=='pcb_via' and abs(e['x']-terminal['x'])<1e-5 and abs(e['y']-terminal['y'])<1e-5)];negative=audit(bad)
  assert any(r['name']=='W25Q32JVSSIQ.4' for r in negative['disconnectedGroundPads']),'Missing flash barrel did not disconnect its pad physically'
  bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
  net=next(e['source_net_id'] for e in bad if e['type']=='source_net' and e['name']=='GND')
  v={'type':'pcb_via','pcb_via_id':'regression_floating_ground_via','x':47.4,'y':98.75,'hole_diameter':.2,'outer_diameter':.3,'layers':LAYERS,'source_net_id':net}
  bad.append(v)
  negative=audit(bad)
  assert not negative['disconnectedGroundPads'],'Via-only regression unexpectedly changed assembled pad connectivity'
  assert any(r['viaId']==v['pcb_via_id'] for r in negative['disconnectedGroundVias']),'Original floating auxiliary via was accepted'
  print('Ground regressions: severed support return, missing flash barrel and original floating auxiliary via rejected')
 sys.exit(0 if result['passed'] else 1)
