"""Retain native-poured islands with a physical path to their source.

This exports bounded outlines for the native tscircuit pour primitive. It does
not find routes. A complete source rebuild must check the exported outlines.
"""
import hashlib,json,sys
from pathlib import Path
from shapely.geometry import Point,Polygon
from shapely.ops import unary_union
from check_layout import model

source,intent_file,output=map(Path,sys.argv[1:4]);raw=source.read_bytes();j,sc,sp,pp,st,vs,ps,cu,ns,root,vn,port=model(json.loads(raw))
intent=json.loads(intent_file.read_text());records=[];kept=[];new_ids=[]
# The source puts these regions first, before all existing pours. Each native
# output polygon is emitted consecutively, so names are not needed for matching.
for rail,origin in [('V12V',('ATX','pin10')),('SLOT_12V',('Q_SLOT_12V','pin5'))]:
 regions=[]
 for layer in ['top','inner1','inner2','inner3','inner4','bottom']:
  union=unary_union([o['shape']for o in cu if o['net']==ns[rail]and layer in o['layers']]).buffer(1e-7)
  regions.extend((layer,p)for p in getattr(union,'geoms',[union])if not p.is_empty)
 parent=list(range(len(regions)))
 def find(i):
  if parent[i]!=i:parent[i]=find(parent[i])
  return parent[i]
 barrels=[v for v in vs.values()if vn(v)==ns[rail]]+[p for p in pp.values()if len(p.get('layers',[]))>1 and root(p.get('source_port_id',''))==ns[rail]]
 for v in barrels:
  ids=[i for i,(layer,p)in enumerate(regions)if layer in v['layers']and p.covers(Point(v['x'],v['y']))]
  for i in ids[1:]:parent[find(i)]=find(ids[0])
 feed=port(*origin);sources={find(i)for i,(layer,p)in enumerate(regions)if layer in feed['layers']and p.covers(Point(feed['x'],feed['y']))}
 selected=[]
 for p in ps.values():
  if p['source_net_id']!=next(e['source_net_id']for e in j if e['type']=='source_net'and e['name']==rail)or p['layer']not in ['top','bottom']:continue
  poly=Polygon([(v['x'],v['y'])for v in p['brep_shape']['outer_ring']['vertices']], [[(v['x'],v['y'])for v in r['vertices']]for r in p['brep_shape'].get('inner_rings',[])])
  point=poly.representative_point();connected=any(find(i)in sources and layer==p['layer']and g.covers(point)for i,(layer,g)in enumerate(regions))
  records.append(dict(rail=rail,layer=p['layer'],areaMm2=poly.area,connected=connected,id=p['pcb_copper_pour_id']))
  if connected and poly.area>.01:selected.append(p)
 for i,p in enumerate(selected):
  kept.append(dict(name=f'{rail}_{p["layer"]}_{i+1}',net=rail,layer=p['layer'],clearance=.225,traceMargin=.95,
    outline=p['brep_shape']['outer_ring']['vertices']))
output.write_text(json.dumps(kept,indent=2)+'\n')
proof=dict(sourceSha256=hashlib.sha256(raw).hexdigest(),sourceFile=str(source),intentFile=str(intent_file),
  output=str(output),keptRegions=len(kept),islands=records,
  scope='Native-filled surface power islands only. Physical connectivity includes explicit vias and plated-hole barrels. Refill and recheck from source after export.')
output.with_suffix('.provenance.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'keptRegions':len(kept),'discardedIslands':sum(not r['connected']or r['areaMm2']<=.01 for r in records)},indent=2))
