"""Audit emitted USB VBUS copper, ground returns and ASMedia 5:8 mil geometry."""
import copy,hashlib,json,sys
from pathlib import Path
from shapely.geometry import Point,LineString
from shapely.ops import unary_union
from check_layout import model,ROOT
from check_vcch import audit as audit_vcch
from check_slot import audit as audit_slot
LAYERS=['top','inner1','inner2','inner3','inner4','bottom']

def audit(raw):
 j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(raw);failures=[];records=[]
 preserved_power=audit_vcch(raw)
 failures.extend('Existing 3.3 V routing: '+f for f in preserved_power['failures'])
 preserved_slot=audit_slot(raw)
 failures.extend('Existing slot power: '+f for f in preserved_slot['failures'])
 def geometry(net):
  regions=[]
  for l in LAYERS:
   shape=unary_union([o['shape'] for o in copper if o['net']==net and l in o['layers']]).buffer(1e-7)
   regions.extend((l,g) for g in getattr(shape,'geoms',[shape]) if not g.is_empty)
  parent=list(range(len(regions)))
  def find(i):
   if parent[i]!=i:parent[i]=find(parent[i])
   return parent[i]
  barrels=[(v['x'],v['y'],v['layers']) for v in vias.values() if via_net(v)==net]
  barrels += [(p['x'],p['y'],p['layers']) for p in pp.values() if len(p['layers'])>1 and root(p.get('source_port_id',''))==net]
  for x,y,layers in barrels:
   touching=[i for i,(l,g) in enumerate(regions) if l in layers and g.covers(Point(x,y))]
   for i in touching[1:]:parent[find(i)]=find(touching[0])
  def contact(p):return {find(i) for i,(l,g) in enumerate(regions) if l in p['layers'] and g.covers(Point(p['x'],p['y']))}
  return regions,find,contact
 for net,origin,targets in [
  ('USB_VBUS',('USBC','A4'),[('USBC',p) for p in ['A4','A9','B4','B9']]+[('R_VBUS_TOP','pin1')]),
  ('USB_VBUS_SENSE',('C_VBUS_SENSE','pin1'),[('R_VBUS_TOP','pin2'),('R_VBUS_BOTTOM','pin1'),('C_VBUS_SENSE','pin1'),('ASM2464PDX','G1')]),
  ('GND',None,[('USBC',p) for p in ['A1','A12','B1','B12']]+[('R_VBUS_BOTTOM','pin2'),('C_VBUS_SENSE','pin2')])]:
  n=nets[net];regions,find,contact=geometry(n)
  source=contact(port(*origin)) if origin else {find(i) for i,(l,g) in enumerate(regions) if l in ['inner1','inner4'] and g.area>100}
  rows=[]
  for part,pin in targets:
   p=port(part,pin);connected=bool(source&contact(p));rows.append({'name':part+'.'+pin,'connected':connected})
   if root(p['source_port_id'])!=n or not connected:failures.append(part+'.'+pin+': no physical '+net+' path')
  records.append({'net':net,'terminals':rows})
 if len({nets[n] for n in ['USB_VBUS','USB_VBUS_SENSE','GND','V5V','V5VSB','VCCH']})!=6:failures.append('VBUS sensing or ATX rails are unexpectedly joined')
 components={c['name']:c for c in sc.values()}
 if components['R_VBUS_TOP']['resistance']!=4700 or components['R_VBUS_BOTTOM']['resistance']!=10000 or abs(components['C_VBUS_SENSE']['capacitance']-1e-6)>1e-12:failures.append('ASMedia divider/filter values changed')
 # Check actual wire copper against foreign copper on its physical layer.
 # Width:spacing is 5:8 mil, not the separate 15:8 mil rail rule.
 rows=[];net_lengths={}
 for t in j:
  if t['type']!='pcb_trace':continue
  name=st.get(t.get('source_trace_id'),{}).get('name','')
  if not name.startswith('VBUS_'):continue
  n=root((st[t['source_trace_id']].get('connected_source_port_ids',[])+st[t['source_trace_id']].get('connected_source_net_ids',[]))[0]);length=0;gap=999
  for a,b in zip(t['route'],t['route'][1:]):
   if a['route_type']!=b['route_type'] or a['route_type']!='wire' or a['layer']!=b['layer']:continue
   line=LineString([(a['x'],a['y']),(b['x'],b['y'])]);length+=line.length
   if line.length<1e-8:continue
   if min(a['width'],b['width'])<.127-1e-7:failures.append(name+': width < 5 mil')
   if n==nets['GND']:continue
   wire=line.buffer(max(a['width'],b['width'])/2)
   foreign=[o for o in copper if o['net']!=n and a['layer'] in o['layers']]
   local=min((wire.distance(o['shape']) for o in foreign),default=999);gap=min(gap,local)
   if local<.2032-1e-5:failures.append(name+f': spacing {local:.6f} mm < 8 mil')
  rows.append({'name':name,'lengthMm':length,'minimumForeignCopperGapMm':None if gap==999 else gap})
  if n!=nets['GND']:net_lengths[n]=net_lengths.get(n,0)+length
  if length>254:failures.append(name+': longer than ASMedia 10 inch guideline')
 for n,length in net_lengths.items():
  length+=sum(via_net(v)==n for v in vias.values())*1.6
  if length>254:failures.append('Conservative total net length, including all branches and full via barrels, exceeds 10 inches')
 return {'passed':not failures,'failures':failures,'connectivity':records,'routes':rows,'existing3V3RoutingPreserved':preserved_power['passed'],'existingSlotPowerPreserved':preserved_slot['passed'],'minimumTraceWidthMm':.127,'requiredSpacingMm':.2032,'scope':'Physical copper and actual plated barrel connectivity. Five raw VBUS terminals, four filtered-sense terminals, six ground pads, existing 4.7k/10k/1uF network and preserved 3.3 V/slot power. Other board ground contacts and power-off/system qualification remain separate.'}

if __name__=='__main__':
 file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw);result=audit(j);result.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest());out=ROOT/'dist/vbus-routing';out.mkdir(parents=True,exist_ok=True);(out/'layout-audit.json').write_text(json.dumps(result,indent=2));print('VBUS physical copper:',result['passed'])
 for f in result['failures']:print(f)
 if '--self-test' in sys.argv and result['passed']:
  bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad;ids={e['source_trace_id'] for e in bad if e['type']=='source_trace' and e.get('name')=='VBUS_TO_BRIDGE'};bad=[e for e in bad if not(e['type']=='pcb_trace' and e.get('source_trace_id') in ids)];assert not audit(bad)['passed'],'Removed bridge sense path accepted'
  target=next(t for t in json.loads((ROOT/'manufacturing/vbus-routing/terminals.json').read_text()) if t['name']=='VBUS_GND_B1')
  bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad;bad=[e for e in bad if not(e['type']=='pcb_via' and abs(e['x']-target['x'])<1e-5 and abs(e['y']-target['y'])<1e-5)];assert not audit(bad)['passed'],'Removed USB-C ground barrel accepted'
  print('VBUS regressions: missing sense path and missing ground barrel rejected')
 sys.exit(0 if result['passed'] else 1)
