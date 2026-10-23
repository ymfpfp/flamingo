"""Audit emitted slot-power copper, without treating package pin groups as wires."""
import copy,hashlib,json,sys
from pathlib import Path
from shapely.geometry import Point
from shapely.ops import unary_union
from check_layout import model,ROOT
LAYERS=['top','inner1','inner2','inner3','inner4','bottom']
TERMINALS=json.loads((ROOT/'manufacturing/slot-power-routing/terminals.json').read_text())
SPECS=json.loads((ROOT/'manufacturing/slot-power-routing/control-specs.json').read_text())
def audit(raw):
 j,sc,sp,pp,st,vias,pours,copper,nets,root,via_net,port=model(raw);failures=[];records=[]
 def geometry(net,onlyInner=False,erode=0):
  regions=[]
  for l in LAYERS:
   if onlyInner and l not in ['inner2','inner3']:continue
   shape=unary_union([o['shape'] for o in copper if o['net']==net and l in o['layers']])
   shape=shape.buffer(-erode) if erode else shape.buffer(1e-7)
   regions.extend((l,g) for g in getattr(shape,'geoms',[shape]) if not g.is_empty)
  parent=list(range(len(regions)))
  def find(i):
   if parent[i]!=i:parent[i]=find(parent[i])
   return parent[i]
  barrels=[(v['x'],v['y'],v['layers']) for v in vias.values() if via_net(v)==net]
  barrels +=[(p['x'],p['y'],p['layers']) for p in pp.values() if len(p['layers'])>1 and root(p.get('source_port_id',''))==net]
  for x,y,layers in barrels:
   touching=[i for i,(l,g) in enumerate(regions) if l in layers and g.covers(Point(x,y))]
   for i in touching[1:]:parent[find(i)]=find(touching[0])
  def contact(p,layers=None):return {find(i) for i,(l,g) in enumerate(regions) if l in (layers or p.get('layers',LAYERS)) and g.covers(Point(p['x'],p['y']))}
  return regions,find,contact
 for rail,origin in [('V12V',('ATX','pin10')),('SLOT_12V',('Q_SLOT_12V','pin5')),('SLOT_3V3',('Q_SLOT_3V3','pin5'))]:
  n=nets[rail];regions,find,contact=geometry(n);source=contact(port(*origin));targets=[]
  for p in pp.values():
   s=sp.get(p.get('source_port_id'),{});part=sc.get(s.get('source_component_id'),{}).get('name')
   if not part or root(p['source_port_id'])!=n:continue
   pin=next((h for h in s['port_hints'] if h.startswith('pin')),s['port_hints'][0]);name=part+'.'+pin
   connected=bool(source&contact(p));targets.append(dict(name=name,connected=connected))
   if not connected:failures.append(name+': no physical '+rail+' copper path')
  floating=[g.area for i,(l,g) in enumerate(regions) if l in ['top','inner2','inner3','bottom'] and find(i) not in source and g.area>.001]
  if floating:failures.append(rail+': floating power copper '+str(floating))
  inner=[o for o in copper if o['net']==n and o['label'] in pours and any(l in ['inner2','inner3'] for l in o['layers'])]
  gaps=[o['shape'].distance(q['shape']) for o in inner for q in copper if q['net']!=n and set(o['layers'])&set(q['layers'])]
  gap=min(gaps,default=0)
  if gap<.2032-1e-5:failures.append(f'{rail}: inner power clearance {gap:.6f} mm < 0.2032 mm')
  core,cf,cc=geometry(n,True,.381/2);csource=cc(port(*origin),['inner2','inner3']);ct=[t for t in TERMINALS if t['net']==rail];narrow=[t['name'] for t in ct if not csource&cc(t)]
  # The drain's geometric centre is inside its copper region on both switches.
  if not csource or narrow:failures.append(rail+': no continuous 15 mil inner copper core: '+str(narrow))
  records.append(dict(rail=rail,terminals=targets,connectedTerminals=sum(t['connected'] for t in targets),minimumPowerGapMm=gap,floatingCopperMm2=floating,continuous15MilCore=bool(csource) and not narrow))
 # GND: all new ground destinations need a real via connection to L2/L5.
 n=nets['GND'];regions,find,contact=geometry(n);reference={find(i) for i,(l,g) in enumerate(regions) if l in ['inner1','inner4'] and g.area>100};grounds=sorted(set(t['selector'] for t in TERMINALS if t['net']=='GND'))
 for q in pp.values():
  s=sp.get(q.get('source_port_id'),{})
  if sc.get(s.get('source_component_id'),{}).get('name')=='ATX' and root(q['source_port_id'])==n:grounds.append('ATX.'+next(h for h in s['port_hints'] if h.startswith('pin')))
 groundRows=[]
 for name in grounds:
  p=port(*name.split('.'));connected=bool(reference&contact(p));groundRows.append(dict(name=name,connected=connected))
  if not connected:failures.append(name+': missing plated path to reference ground')
 controlRows=[]
 for spec in SPECS:
  points=[]
  for s in [spec['from'],spec['to']]:
   part,pin=s.split('.');t=next((t for t in TERMINALS if t['name']==part),None);points.append(t if t else port(part,pin))
  a,b=points;n=root(port('ASM2464PDX','HDDPC')['source_port_id']) if spec['name'].startswith('SP_HDDPC') else root(port(*spec['from'].split('.'))['source_port_id'])
  _,_,contact=geometry(n);connected=bool(contact(a)&contact(b));controlRows.append(dict(name=spec['name'],connected=connected))
  if not connected:failures.append(spec['name']+': no physical control connection')
 if len({nets[n] for n in ['V12V','SLOT_12V','VCCH','SLOT_3V3','GND']})!=5:failures.append('Power nets unexpectedly merged')
 return dict(passed=not failures,failures=failures,power=records,grounds=groundRows,controls=controlRows,scope='Physical union of emitted copper, joined across layers only by real plated barrels. Every switch power pad, slot power pin, capacitor, discharge, driver, control and new ground contact is checked. Power cores >=0.381 mm; inner power spacing >=0.2032 mm. Fabrication and outer high-speed isolation are checked separately.')
if __name__=='__main__':
 file=Path(sys.argv[1]);raw=file.read_bytes();j=json.loads(raw);result=audit(j);result.update(sourceFile=str(file),sourceSha256=hashlib.sha256(raw).hexdigest());out=ROOT/'dist/slot-power-routing';out.mkdir(parents=True,exist_ok=True);(out/'layout-audit.json').write_text(json.dumps(result,indent=2));print('Slot power physical copper:',result['passed'])
 for f in result['failures']:print(f)
 if '--self-test' in sys.argv and result['passed']:
  bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
  net=next(e['source_net_id'] for e in bad if e['type']=='source_net' and e['name']=='SLOT_12V');bad=[e for e in bad if not(e['type']=='pcb_copper_pour' and e['source_net_id']==net)];assert not audit(bad)['passed'],'Removed slot12V pours were accepted'
  bad=copy.deepcopy(j);bad=bad['circuitJson'] if isinstance(bad,dict) else bad
  # Surface copper now provides a second physical connection to the drain.
  # Remove both alternatives to test a genuinely disconnected switch output.
  bad=[e for e in bad if not(e['type']=='pcb_via' and e['x']>33 and e['x']<36 and e['y']>57 and e['y']<62)
       and not(e['type']=='pcb_copper_pour' and e['source_net_id']==net and e['layer']in ['top','bottom'])]
  assert not audit(bad)['passed'],'Removed switch-to-plane connections were accepted'
  print('Slot regression: missing output copper and switch-to-plane connections rejected')
 sys.exit(0 if result['passed'] else 1)
