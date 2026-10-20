"""Exact copper geometry shared by USB layout checks. This module performs no routing."""
import math
from shapely.geometry import LineString, Point, Polygon, box
from shapely.affinity import rotate

def copper_objects(j):
    sources={e['source_component_id']:e.get('name','') for e in j if e['type']=='source_component'}
    names={e['pcb_component_id']:sources.get(e.get('source_component_id'),e['pcb_component_id']) for e in j if e['type']=='pcb_component'}
    copper=[]
    def add(e,geom,layers,label,trace_id=None,port_id=None):
        copper.append({'shape':geom,'layers':layers,'label':label,'trace':trace_id,'port':port_id})
    for e in j:
        t=e['type']; label=names.get(e.get('pcb_component_id'),e.get('pcb_via_id',t))
        if t=='pcb_smtpad':
            x,y=e.get('x',0),e.get('y',0); shape=e['shape']
            label=f"{label}.{','.join(e.get('port_hints',[]))}"
            if shape=='circle': geom=Point(x,y).buffer(e['radius'],quad_segs=32)
            elif shape in ['pill','rotated_pill']:
                w,h=e['width'],e['height']; r=min(w,h)/2
                geom=LineString([(x-(w/2-r),y-(h/2-r)),(x+(w/2-r),y+(h/2-r))]).buffer(r,quad_segs=32)
                geom=rotate(geom,e.get('ccw_rotation',0),origin=(x,y))
            elif shape in ['rect','rotated_rect']:
                geom=box(x-e['width']/2,y-e['height']/2,x+e['width']/2,y+e['height']/2)
                geom=rotate(geom,e.get('ccw_rotation',0),origin=(x,y))
            elif shape=='polygon': geom=Polygon([(p['x'],p['y']) for p in e['points']])
            else: raise ValueError(f'Unsupported pad shape: {shape}')
            add(e,geom,[e['layer']],label,port_id=e.get('pcb_port_id'))
        elif t=='pcb_via': add(e,Point(e['x'],e['y']).buffer(e['outer_diameter']/2,quad_segs=32),e['layers'],label,trace_id=e.get('pcb_trace_id'))
        elif t=='pcb_trace':
            for a,b in zip(e['route'],e['route'][1:]):
                if a['route_type']==b['route_type']=='wire' and a['layer']==b['layer'] and math.hypot(a['x']-b['x'],a['y']-b['y'])>1e-8:
                    add(e,LineString([(a['x'],a['y']),(b['x'],b['y'])]).buffer(a['width']/2,quad_segs=16),[a['layer']],e['pcb_trace_id'],trace_id=e['pcb_trace_id'])
        elif t=='pcb_plated_hole':
            if e['shape']=='circle': geom=Point(e['x'],e['y']).buffer(e['outer_diameter']/2,quad_segs=32)
            elif e['shape']=='circular_hole_with_rect_pad':
                x,y=e['x'],e['y'];w,h=e['rect_pad_width'],e['rect_pad_height']
                geom=rotate(box(x-w/2,y-h/2,x+w/2,y+h/2),e.get('rect_ccw_rotation',0),origin=(x,y))
            elif e['shape']=='pill':
                x,y=e['x'],e['y'];w,h=e['outer_width'],e['outer_height'];r=min(w,h)/2
                geom=LineString([(x-(w/2-r),y-(h/2-r)),(x+(w/2-r),y+(h/2-r))]).buffer(r,quad_segs=32)
                geom=rotate(geom,e.get('ccw_rotation',0),origin=(x,y))
            else: raise ValueError(f'Unsupported plated hole: {e}')
            add(e,geom,['top','bottom'],label,port_id=e.get('pcb_port_id'))
        elif t=='pcb_copper_pour' and e['layer'] in ['top','bottom']:
            b=e['brep_shape']; geom=Polygon([(p['x'],p['y']) for p in b['outer_ring']['vertices']],
                [[(p['x'],p['y']) for p in r['vertices']] for r in b.get('inner_rings',[])])
            add(e,geom,[e['layer']],e['pcb_copper_pour_id'])
    return copper
