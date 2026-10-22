"""Conservatively cover emitted surface-pour copper with SRJ rectangles.

This is obstacle conversion only; no route search or path generation occurs.
Small grid cells preserve openings that a whole-pour bounding box would fill.
"""
import json, math, sys, hashlib
from pathlib import Path
import numpy as np
import shapely
import importlib.util
from shapely.geometry import Polygon, box
from shapely.ops import unary_union


def cover_polygon(shape, step=.05):
    # Reuse a spatial index for the many cell-intersection predicates. This
    # changes neither the geometry nor the conservative coverage criterion.
    shapely.prepare(shape)
    x0, y0, x1, y1 = shape.bounds
    x0, y0 = math.floor(x0 / step) * step, math.floor(y0 / step) * step
    cols, rows = math.ceil((x1 - x0) / step), math.ceil((y1 - y0) / step)
    xs = x0 + np.arange(cols) * step
    active, rectangles = {}, []
    for row in range(rows):
        y = y0 + row * step
        cells = shapely.box(xs, y, xs + step, y + step)
        # Intersections, including boundary touches, give a conservative cover.
        occupied = np.asarray(shapely.intersects(shape, cells), dtype=bool)
        edges = np.flatnonzero(np.diff(np.r_[False, occupied, False]))
        runs = set(zip(edges[::2], edges[1::2]))
        for run in list(active):
            if run not in runs:
                first, last = run
                rectangles.append((x0 + first * step, active.pop(run), x0 + last * step, y))
        for run in runs:
            active.setdefault(run, y)
    for (first, last), y in active.items():
        rectangles.append((x0 + first * step, y, x0 + last * step, y0 + rows * step))
    return rectangles


def convert(raw, step=.05):
    j = raw.get('circuitJson', raw) if isinstance(raw, dict) else raw
    output, checks = [], []
    for p in j:
        if p['type'] != 'pcb_copper_pour' or p['layer'] not in ['top', 'bottom']:
            continue
        b = p['brep_shape']
        shape = Polygon([(v['x'], v['y']) for v in b['outer_ring']['vertices']],
                        [[(v['x'], v['y']) for v in r['vertices']] for r in b.get('inner_rings', [])])
        rects = cover_polygon(shape, step)
        cover = unary_union([box(*r) for r in rects])
        missed = shape.difference(cover.buffer(1e-9)).area
        if missed > 1e-10:
            raise ValueError(f"{p['pcb_copper_pour_id']}: obstacle cover omitted copper ({missed} mm2)")
        checks.append({'pourId': p['pcb_copper_pour_id'], 'coveredCopperAreaMm2': shape.area,
                       'coverAreaMm2': cover.area, 'missedAreaMm2': missed, 'rectangles': len(rects)})
        for i, (x0, y0, x1, y1) in enumerate(rects):
            output.append({'type': 'rect', 'obstacleId': f"{p['pcb_copper_pour_id']}_cover_{i}",
                           'center': {'x': (x0 + x1) / 2, 'y': (y0 + y1) / 2},
                           'width': x1 - x0, 'height': y1 - y0, 'layers': [p['layer']], 'connectedTo': [],
                           'circuitJsonMetadata': {'pcb_copper_pour_id': p['pcb_copper_pour_id'], 'coverGridMm': step}})
    cutouts = []
    for p in j:
        if p['type'] != 'pcb_cutout': continue
        if p['shape'] != 'polygon': raise ValueError('Unsupported board cutout shape')
        shape = Polygon([(v['x'],v['y']) for v in p['points']]).buffer(.2,quad_segs=64)
        for i,(x0,y0,x1,y1) in enumerate(cover_polygon(shape,step)):
            cutouts.append({'type':'rect','obstacleId':f"{p['pcb_cutout_id']}_{i}",
                'center':{'x':(x0+x1)/2,'y':(y0+y1)/2},'width':x1-x0,'height':y1-y0,
                'layers':['top','bottom'],'connectedTo':[]})
    return {'gridMm': step, 'obstacles': output, 'cutoutObstacles':cutouts, 'checks': checks, 'missedCopperAreaMm2': sum(c['missedAreaMm2'] for c in checks)}


def isolation_cover(raw, step=.05):
    """Use the existing audits' exact checked regions, including launch scopes."""
    root = Path(__file__).resolve().parents[2]
    regions = []
    for i, name in enumerate(['pcie-tx/check_asmedia_spacing.py', 'usb4/check_layout.py', 'bridge-clocks/check_layout.py']):
        spec = importlib.util.spec_from_file_location(f'control_isolation_{i}', root/'simulations'/name)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        report = module.audit(raw, isolation_regions=regions)
        if not report['passed']:
            raise ValueError(f'Existing isolation audit failed: {name}')
    obstacles, checks, serial = [], [], []
    for index, region in enumerate(regions):
        shape = region['shape']
        rects = cover_polygon(shape, step)
        cover = unary_union([box(*r) for r in rects])
        missed = shape.difference(cover.buffer(1e-9)).area
        if missed > 1e-10: raise ValueError('High-speed isolation cover omitted copper')
        checks.append({'name': region['name'], 'missedAreaMm2': missed, 'rectangles': len(rects)})
        serial.append({**{k:v for k,v in region.items() if k != 'shape'}, 'shapeWkbHex': shape.wkb_hex})
        for k, (x0, y0, x1, y1) in enumerate(rects):
            obstacles.append({'type':'rect','obstacleId':f'isolation_{index}_{k}',
                              'center':{'x':(x0+x1)/2,'y':(y0+y1)/2},'width':x1-x0,'height':y1-y0,
                              'layers':[region['layer']],'connectedTo':[], 'requiredGapMm':region['requiredGapMm']})
    return {'isolationObstacles':obstacles,'isolationChecks':checks,'isolationRegions':serial}


if __name__ == '__main__':
    source, destination = map(Path, sys.argv[1:3])
    raw = json.loads(source.read_text())
    result = convert(raw)
    reference = next((a.split('=',1)[1] for a in sys.argv[3:] if a.startswith('--isolation-reference=')), None)
    if reference:
        # A routing draft can remove surface fills for native refill. Reuse
        # isolation scopes only when every protected signal trace and barrel
        # is identical to a reference that passes the complete isolation audit.
        original = json.loads(Path(reference).read_text())
        def protected(board):
            sources = {e['source_trace_id'] for e in board if e['type']=='source_trace'
                       and e.get('name','').startswith(('PCIE_', 'USB4_', 'USB2_', 'CLOCK_'))}
            traces = [e for e in board if e['type']=='pcb_trace' and e.get('source_trace_id') in sources]
            ids = {e['pcb_trace_id'] for e in traces}
            barrels = [e for e in board if e['type']=='pcb_via' and
                       (e.get('source_trace_id') in sources or e.get('pcb_trace_id') in ids)]
            return sorted(json.dumps(e,sort_keys=True) for e in traces+barrels)
        if not protected(original) or protected(original) != protected(raw):
            raise ValueError('Draft changed protected signal geometry')
        result.update(isolation_cover(original))
        result['isolationReferenceSha256'] = hashlib.sha256(Path(reference).read_bytes()).hexdigest()
        result['draftRequiresFreshFillAndFullIsolationAudit'] = True
    else:
        result.update(isolation_cover(raw))
    result['sourceSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f"Surface copper obstacles: {len(result['checks'])} pours, {len(result['obstacles'])} rectangles, no omitted copper")
