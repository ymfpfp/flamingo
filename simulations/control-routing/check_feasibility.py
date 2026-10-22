"""Necessary REXT launch conditions for the current fixed six-layer layout.

This is geometric validation, not a router. Nonempty attachment space does
not establish that a complete path exists. Empty space is a blocking local
constraint for the supported round-ended traces and through-vias.
"""
import hashlib
import json
import sys
from pathlib import Path
import shapely
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'simulations/power-distribution'))
from check_layout import model


def attachment_space(pad, foreign, width, clearance):
    # One micrometer of extra attachment space makes this an optimistic
    # necessary-condition test despite the emitted polygons' circle facets.
    possible = pad.buffer(width/2 + .001, quad_segs=128)
    forbidden = unary_union([s.buffer(width/2 + clearance, quad_segs=128) for s in foreign])
    return possible.difference(forbidden)


def audit(raw, constraints):
    j, sc, sp, pp, st, vias, pours, copper, nets, root, via_net, port = model(raw)
    terminal = port('ASM2464PDX', 'REXT')
    net = root(terminal['source_port_id'])
    pad = next(o['shape'] for o in copper if o['port'] == terminal['pcb_port_id'])
    foreign = [o['shape'] for o in copper if o['net'] != net and 'top' in o['layers'] and o['shape'].distance(pad) < 2]
    legal = attachment_space(pad, foreign, .254, .1778)
    bottom = [{**r, 'shape':shapely.from_wkb(bytes.fromhex(r['shapeWkbHex']))} for r in constraints['isolationRegions'] if r['layer'] == 'bottom']
    # A through-via has copper on the bottom at every location where its top
    # pad contacts REXT. If the whole REXT pad projection is forbidden below,
    # increasing the via diameter or offsetting it cannot create an escape.
    exclusions = unary_union([r['shape'].buffer(r['requiredGapMm']-.001, quad_segs=128) for r in bottom])
    via_contact = pad.buffer(.001).difference(exclusions)
    covering = [r['name'] for r in bottom if pad.buffer(.001).difference(r['shape'].buffer(r['requiredGapMm']-.001, quad_segs=128)).is_empty]
    return {'net':'REXT', 'requiredWidthMm':.254, 'requiredTraceGapMm':.1778,
            'legalFullWidthPadAttachmentAreaMm2':legal.area,
            'fullWidthPadAttachmentPossible':not legal.is_empty,
            'padProjectionOutsideBottomIsolationMm2':via_contact.area,
            'throughViaPadContactPossible':not via_contact.is_empty,
            'coveringBottomIsolationRegions':covering,
            'blockedUnderCurrentConstraints':legal.is_empty and via_contact.is_empty,
            'scope':'Necessary attachment-space test, including offset pad-edge trace starts and through-via contacts. Existing copper, ASMedia trunk isolation, top-only assembly, and the outer-signal-layer policy remain fixed. Attachment space is enlarged and isolation reduced by 1 um to allow for polygon faceting. No routing, geometry changes or exceptions.'}


if __name__ == '__main__':
    board = Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'dist/control-routing/input.json'
    cover = Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'dist/control-routing/pour-obstacles.json'
    output = Path(sys.argv[3]) if len(sys.argv)>3 else ROOT/'dist/control-routing/rext-launch-feasibility.json'
    constraints = json.loads(cover.read_text())
    sha = hashlib.sha256(board.read_bytes()).hexdigest()
    if constraints['sourceSha256'] != sha: raise ValueError('Isolation constraints belong to a different board')
    report = audit(json.loads(board.read_text()), constraints)
    report['sourceSha256'] = sha
    output.write_text(json.dumps(report,indent=2)+'\n')
    print('Strict REXT launch:', 'BLOCKED' if report['blockedUnderCurrentConstraints'] else 'local attachment space exists; routing still required')
