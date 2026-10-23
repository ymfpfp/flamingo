"""Select comparable local PCB transition fixtures without changing the board."""
from pathlib import Path
import hashlib,json,math,sys
import numpy as np
from shapely.geometry import Point,LineString,Polygon,box
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'simulations/pcie-tx'))
from copper_geometry import copper_objects

HANDOFF=ROOT/'dist/si-channel-review/field-solver-handoff.json'
OUT=ROOT/'dist/si-channel-review/all-channels'

def route_data(stage):
    items=[];distance=0.
    for i,s in enumerate(stage['segments']):
        a=np.array([s['from']['x'],s['from']['y']]);b=np.array([s['to']['x'],s['to']['y']])
        length=float(np.linalg.norm(b-a));delta=b-a
        axis=0 if abs(delta[1])<1e-8 else 1 if abs(delta[0])<1e-8 else None
        items.append({**s,'a':a,'b':b,'start':distance,'end':distance+length,'axis':axis,'index':i})
        distance+=length
    return items,distance

def nearest_distance(items,point):
    p=np.array(point);best=None
    for s in items:
        d=s['b']-s['a'];fraction=float(np.clip(np.dot(p-s['a'],d)/np.dot(d,d),0,1))
        error=float(np.linalg.norm(s['a']+fraction*d-p));along=s['start']+fraction*(s['end']-s['start'])
        candidate=(error,along)
        if best is None or candidate<best:best=candidate
    assert best[0]<1e-5,best
    return best[1]

def select_pair(items,pivots,side,grounds):
    choices=[]
    for a in items[0]:
        for b in items[1]:
            if a['axis'] is None or a['axis']!=b['axis'] or a['layer']!=b['layer']:continue
            axis=a['axis'];directions=[int(np.sign(s['b'][axis]-s['a'][axis])) for s in [a,b]]
            if directions[0]!=directions[1]:continue
            if side=='before' and any(s['end']>p+1e-6 for s,p in zip([a,b],pivots)):continue
            if side=='after' and any(s['start']<p-1e-6 for s,p in zip([a,b],pivots)):continue
            lo=max(min(s['a'][axis],s['b'][axis]) for s in [a,b])
            hi=min(max(s['a'][axis],s['b'][axis]) for s in [a,b])
            if hi-lo<.075:continue
            sign=directions[0];near=(hi if sign>0 else lo) if side=='before' else (lo if sign>0 else hi)
            inset=min(.45,(hi-lo)/2)
            desired=near+(-sign if side=='before' else sign)*inset
            edge=min(.065,(hi-lo)/2)
            for q in np.unique(np.r_[desired,np.linspace(lo+edge,hi-edge,17)]):
                refs=[];score=4*abs(q-desired);valid=True
                for s,p in zip([a,b],pivots):
                    f=(q-s['a'][axis])/(s['b'][axis]-s['a'][axis]);pt=s['a']+f*(s['b']-s['a'])
                    arc=s['start']+f*(s['end']-s['start']);score+=abs(arc-p)
                    cross=[pt.copy(),pt.copy()];cross[0][1-axis]-=s['widthMm']/2;cross[1][1-axis]+=s['widthMm']/2
                    if not grounds[s['layer']].buffer(1e-8).covers(LineString(cross)):valid=False;break
                    refs.append({'xy':pt.tolist(),'axis':axis,'travelSign':sign,'incomingSign':sign if side=='before' else -sign,
                                 'layer':s['layer'],'widthMm':s['widthMm'],'arcMm':arc,'segmentIndex':s['index']})
                if valid:choices.append((score,refs))
    if not choices:raise ValueError('No common straight reference planes '+side+' transition')
    return min(choices,key=lambda x:x[0])[1]

def plan_channel(channel,geometry):
    conductors=channel['conductors'];stage_index=max((i for i,s in enumerate(conductors[0]['stages']) if s['vias']),default=0)
    stages=[];trace_ids=[]
    for co in conductors:
        stage=dict(co['stages'][stage_index]);stage['segments']=list(stage['segments']);stage['vias']=list(stage['vias']);trace_ids.append(stage['traceId'])
        if channel['name']=='USB4_RX1':
            previous=co['stages'][stage_index-1]
            assert np.linalg.norm(np.array(list(previous['segments'][-1]['to'].values()))-np.array(list(stage['segments'][0]['from'].values())))<1e-6
            stage['segments']=list(previous['segments'])+stage['segments'];trace_ids.append(previous['traceId'])
        for following in co['stages'][stage_index+1:]:
            previous=stage['segments'][-1]['to'];nxt=following['segments'][0]['from']
            if np.linalg.norm(np.array(list(previous.values()))-np.array(list(nxt.values())))>1e-6:break
            stage['segments'].extend(following['segments']);stage['vias'].extend(following['vias']);trace_ids.append(following['traceId'])
        stages.append(stage)
    grounds={}
    for layer,plane in [('top','inner1'),('bottom','inner4')]:
        shapes=[]
        for e in geometry['groundPlanes']:
            if e['layer']!=plane:continue
            b=e['brep_shape'];shapes.append(Polygon([(p['x'],p['y']) for p in b['outer_ring']['vertices']],
                [[(p['x'],p['y']) for p in r['vertices']] for r in b.get('inner_rings',[])]))
        grounds[layer]=unary_union(shapes)
    data=[route_data(s)[0] for s in stages]
    if stages[0]['vias']:
        choose=min if channel['name']=='USB4_RX1' else max
        selected=[choose(s['vias'],key=lambda v:nearest_distance(items,[v['x'],v['y']])) for s,items in zip(stages,data)]
        pivots=[nearest_distance(items,[v['x'],v['y']]) for items,v in zip(data,selected)]
        kind='ESD-side via pair at the sparse-return review point' if channel['name']=='USB4_RX1' else 'connector-side via pair and surface fanout'
    else:
        selected=[];pivots=[]
        for items in data:
            s=next(s for s in items if s['axis']==0 and s['lengthMm']>1 and s['widthMm']>.1)
            pivots.append(s['end'])
        kind='via-free surface bend after the bridge escape'
    inputs=select_pair(data,pivots,'before',grounds);outputs=select_pair(data,pivots,'after',grounds)
    refs=inputs+outputs
    selected_shapes=[];segments=[]
    for items,left,right in zip(data,inputs,outputs):
        trimmed=[]
        for s in items:
            low=max(s['start'],left['arcMm']);high=min(s['end'],right['arcMm'])
            if high-low<1e-8:continue
            a=s['a']+(s['b']-s['a'])*(low-s['start'])/(s['end']-s['start'])
            b=s['a']+(s['b']-s['a'])*(high-s['start'])/(s['end']-s['start'])
            item={'from':a.tolist(),'to':b.tolist(),'layer':s['layer'],'widthMm':s['widthMm']};trimmed.append(item)
            selected_shapes.extend([a,b])
        segments.append(trimmed)
    coords=np.array(selected_shapes);bounds=[float(coords[:,0].min()-.85),float(coords[:,1].min()-.85),float(coords[:,0].max()+.85),float(coords[:,1].max()+.85)]
    board=next(e for e in geometry['boardContext'] if e['type']=='pcb_board')
    board_edges=[board['center']['x']-board['width']/2,board['center']['y']-board['height']/2,
                 board['center']['x']+board['width']/2,board['center']['y']+board['height']/2]
    # Include the physical plane setback near the board edge. Extending a
    # cropped plane blindly to the outline would erase its real setback.
    for axis in [0,1]:
        if 0<bounds[axis]-board_edges[axis]<.9:bounds[axis]=board_edges[axis]-.4
        if 0<board_edges[axis+2]-bounds[axis+2]<.9:bounds[axis+2]=board_edges[axis+2]+.4
    if channel['name']=='USB4_RX1':
        # Keep the nearby physical USB cutout and its copper setback inside
        # the extraction interior in all domain studies, outside the PML.
        bounds[2]=max(bounds[2],47.8)
    returns={}
    for via in selected:
        nearest=sorted(geometry['groundVias'],key=lambda q:math.hypot(via['x']-q['x'],via['y']-q['y']))[:2]
        d0=math.hypot(via['x']-nearest[0]['x'],via['y']-nearest[0]['y'])
        for ground in nearest:
            distance=math.hypot(via['x']-ground['x'],via['y']-ground['y'])
            if distance>max(d0*1.5,d0+.3):continue
            returns[ground['pcb_via_id']]=ground
            # Keep the principal return barrels in the physical interior.
            # Existing interior stitches need no artificial extra margin.
            if not(bounds[0]<ground['x']<bounds[2] and bounds[1]<ground['y']<bounds[3]):
                radius=ground['outer_diameter']/2+.15
                bounds=[min(bounds[0],ground['x']-radius),min(bounds[1],ground['y']-radius),
                        max(bounds[2],ground['x']+radius),max(bounds[3],ground['y']+radius)]
    # Via lands belonging to another excluded section must not become
    # disconnected metal inside the extraction crop.
    selected_ids={v['pcb_via_id'] for v in selected}
    excluded=[v['pcb_via_id'] for s in stages for v in s['vias'] if v['pcb_via_id'] not in selected_ids]
    return {'channel':channel['name'],'kind':kind,'stageIndex':stage_index,'traceIds':trace_ids,
        'ports':refs,'segments':segments,'selectedVias':selected,'excludedTargetVias':excluded,'boundsMm':bounds,
        'principalReturnVias':list(returns.values()),
        'feedShiftMm':.18 if min(s['lengthMm'] for items,ref in zip(data,outputs) for s in items if s['index']==ref['segmentIndex'])<.2 else .35,
        'sourceSha256':geometry['sourceSha256']}

def main():
    geometry=json.loads(HANDOFF.read_text());OUT.mkdir(parents=True,exist_ok=True)
    plans=[]
    for channel in geometry['channels']:
        if channel['name']=='USB4_RX2':continue
        try:plans.append({'supported':True,**plan_channel(channel,geometry)})
        except Exception as error:plans.append({'channel':channel['name'],'supported':False,'error':str(error)})
    result={'sourceSha256':geometry['sourceSha256'],'handoffSha256':hashlib.sha256(HANDOFF.read_bytes()).hexdigest(),
            'scope':'Comparable local PCB transitions; not whole-channel compliance.','plans':plans}
    (OUT/'plan.json').write_text(json.dumps(result,indent=2)+'\n')
    for p in plans:print(p['channel'],p['supported'],p.get('error',p.get('kind')))

if __name__=='__main__':main()
