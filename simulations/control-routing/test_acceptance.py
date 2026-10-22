import copy
import unittest
from check_acceptance import audit, pth_launch
from shapely.geometry import Point, box


def fixture():
    board = [
        {'type': 'pcb_board', 'center': {'x': 5, 'y': 3}, 'width': 10, 'height': 6},
        {'type': 'source_net', 'source_net_id': 'gnd', 'name': 'GND'},
        {'type': 'source_trace', 'source_trace_id': 'signal', 'connected_source_port_ids': ['a', 'b'], 'connected_source_net_ids': []},
    ]
    for name, x in [('a', 1), ('b', 9)]:
        board += [
            {'type': 'source_port', 'source_port_id': name},
            {'type': 'pcb_port', 'pcb_port_id': name, 'source_port_id': name, 'x': x, 'y': 1, 'layers': ['top']},
            {'type': 'pcb_smtpad', 'pcb_port_id': name, 'pcb_component_id': name, 'shape': 'circle', 'x': x, 'y': 1, 'radius': .15, 'layer': 'top'},
        ]
    for layer in ['inner1', 'inner4']:
        board.append({'type': 'pcb_copper_pour', 'pcb_copper_pour_id': layer, 'source_net_id': 'gnd', 'layer': layer,
                      'brep_shape': {'outer_ring': {'vertices': [{'x': x, 'y': y} for x, y in [(0, 0), (10, 0), (10, 6), (0, 6)]]}, 'inner_rings': []}})
    terminals = [{'sourcePortId': name, 'x': x, 'y': 1, 'layers': ['top']} for name, x in [('a', 1), ('b', 9)]]
    job = {'name': 'test', 'rule': {'widthMm': .127, 'clearanceMm': .2032, 'maxLengthMm': 254}, 'terminals': terminals}
    def w(x, layer): return {'route_type': 'wire', 'x': x, 'y': 1, 'width': .127, 'layer': layer}
    def v(x, a, b): return {'route_type': 'via', 'x': x, 'y': 1, 'via_diameter': .3, 'via_hole_diameter': .2, 'from_layer': a, 'to_layer': b}
    route = [w(1, 'top'), w(2, 'top'), v(2, 'top', 'bottom'), w(2, 'bottom'), w(8, 'bottom'), v(8, 'bottom', 'top'), w(8, 'top'), w(9, 'top')]
    results = [{'net': 'test', 'solved': True, 'traces': [{'route': route}]}]
    return board, [job], results


class AcceptanceTests(unittest.TestCase):
    def cc_launch_fixture(self):
        board, jobs, results = fixture()
        for e in board:
            if e['type'] == 'source_port': e['source_component_id'] = e['source_port_id'] + '_owner'
        board.extend({'type':'source_component','source_component_id':p+'_owner','name':p} for p in ['a','b'])
        jobs[0].update(name='ASM_CC1', fixedPadLaunchPolicy={'policy':'cc-launch-policy','maximumDistanceFromTerminalMm':1})
        for t in jobs[0]['terminals']:t.update(selector=t['sourcePortId']+'.pin1',pcb_port_id=t['sourcePortId'])
        jobs[0]['rule'].update(widthMm=.2032,clearanceMm=.381)
        results[0]['net']='ASM_CC1'
        for p in results[0]['traces'][0]['route']:
            if p['route_type']=='wire':p['width']=.2032
        board += [{'type':'source_port','source_port_id':'foreign','source_component_id':'a_owner'},
                  {'type':'pcb_port','pcb_port_id':'foreign','source_port_id':'foreign'},
                  {'type':'pcb_smtpad','pcb_port_id':'foreign','pcb_component_id':'a','shape':'circle','x':1,'y':1.46,'radius':.1,'layer':'top'}]
        return board,jobs,results

    def test_cc_launch_approval_only_relaxes_fixed_pad_clearance(self):
        args=self.cc_launch_fixture()
        self.assertTrue(audit(*args)['passed'])
        del args[1][0]['fixedPadLaunchPolicy']
        self.assertIn('signal-spacing',[f['rule']for f in audit(*args)['nets'][0]['failures']])

    def test_cc_launch_does_not_relax_foreign_component_pads(self):
        board,jobs,results=self.cc_launch_fixture()
        next(e for e in board if e['type']=='source_port'and e['source_port_id']=='foreign')['source_component_id']='other_owner'
        self.assertIn('signal-spacing',[f['rule']for f in audit(board,jobs,results)['nets'][0]['failures']])

    def test_cc_launch_does_not_relax_trace_spacing_or_high_speed_isolation(self):
        board,jobs,results=self.cc_launch_fixture()
        board += [{'type':'source_trace','source_trace_id':'other','connected_source_port_ids':['foreign'],'connected_source_net_ids':[]},
                  {'type':'pcb_trace','pcb_trace_id':'other','source_trace_id':'other','route':[
                      {'route_type':'wire','x':1,'y':1.46,'width':.1,'layer':'top'},
                      {'route_type':'wire','x':1.5,'y':1.46,'width':.1,'layer':'top'}]}]
        failures=audit(board,jobs,results,[{'layer':'bottom','shape':box(1.9,.9,2.1,1.1),'requiredGapMm':.8,'name':'preserved pair'}])['nets'][0]['failures']
        self.assertIn('signal-spacing',[f['rule']for f in failures])
        self.assertTrue(any('isolation'in f['rule']for f in failures))

    def test_cc_launch_cannot_expand_its_approved_region(self):
        board,jobs,results=self.cc_launch_fixture()
        jobs[0]['fixedPadLaunchPolicy']['maximumDistanceFromTerminalMm']=1.1
        with self.assertRaises(ValueError):audit(board,jobs,results)

    def test_authored_inner_signal_requires_explicit_policy_and_keeps_reference(self):
        board, jobs, results = fixture()
        for point in results[0]['traces'][0]['route']:
            if point.get('layer') == 'bottom': point['layer'] = 'inner3'
            if point.get('to_layer') == 'bottom': point['to_layer'] = 'inner3'
            if point.get('from_layer') == 'bottom': point['from_layer'] = 'inner3'
        self.assertFalse(audit(board, jobs, results)['passed'])
        jobs[0]['allowedSignalLayers'] = ['top', 'inner3', 'bottom']
        self.assertTrue(audit(board, jobs, results)['passed'])
        board[:] = [e for e in board if e.get('pcb_copper_pour_id') != 'inner4']
        row = audit(board, jobs, results)['nets'][0]
        self.assertIn('ground-reference', [f['rule'] for f in row['failures']])

    def test_square_pth_launch_uses_actual_pad_including_corners(self):
        h = {'pcb_port_id': 'square', 'shape': 'circular_hole_with_rect_pad',
             'rect_pad_width': 1.5, 'rect_pad_height': 1.5, 'x': 0, 'y': 0}
        launch = pth_launch(h, [{'port': 'square', 'shape': box(-.75, -.75, .75, .75)}])
        self.assertTrue(launch.covers(Point(.8, .8)))
        self.assertFalse(launch.covers(Point(1.0, 1.0)))

    def test_connected_route_passes_without_mutating_board(self):
        args = fixture()
        original = copy.deepcopy(args)
        self.assertTrue(audit(*args)['passed'])
        self.assertEqual(args, original)

    def test_a_found_path_through_foreign_copper_is_rejected(self):
        board, jobs, results = fixture()
        board += [{'type': 'source_port', 'source_port_id': 'foreign'},
                  {'type': 'pcb_port', 'pcb_port_id': 'foreign', 'source_port_id': 'foreign'},
                  {'type': 'pcb_smtpad', 'pcb_port_id': 'foreign', 'pcb_component_id': 'foreign', 'shape': 'circle', 'x': 5, 'y': 1, 'radius': .15, 'layer': 'bottom'}]
        self.assertIn('signal-spacing', [f['rule'] for f in audit(board, jobs, results)['nets'][0]['failures']])

    def test_hidden_inner_trace_blocks_a_through_via(self):
        board, jobs, results = fixture()
        board += [{'type': 'source_trace', 'source_trace_id': 'foreign', 'connected_source_port_ids': ['foreign'], 'connected_source_net_ids': []},
                  {'type': 'pcb_trace', 'pcb_trace_id': 'inner', 'source_trace_id': 'foreign', 'route': [
                      {'route_type': 'wire', 'x': 1, 'y': 1.2, 'width': .15, 'layer': 'inner2'},
                      {'route_type': 'wire', 'x': 3, 'y': 1.2, 'width': .15, 'layer': 'inner2'}]}]
        row = audit(board, jobs, results)['nets'][0]
        self.assertIn('via-drill-to-trace', [f['rule'] for f in row['failures']])

    def test_unplated_hole_blocks_a_wire_even_without_a_candidate_via(self):
        board,jobs,results=fixture()
        board.append({'type':'pcb_hole','hole_shape':'circle','x':5,'y':1,'hole_diameter':1})
        self.assertIn('mechanical-hole',[f['rule']for f in audit(board,jobs,results)['nets'][0]['failures']])

    def test_board_cutout_blocks_surface_wire_and_through_via(self):
        board,jobs,results=fixture()
        board.append({'type':'pcb_cutout','pcb_cutout_id':'slot','shape':'polygon',
                      'points':[{'x':x,'y':y}for x,y in [(1.8,.8),(5.2,.8),(5.2,1.2),(1.8,1.2)]]})
        failures=audit(board,jobs,results)['nets'][0]['failures']
        self.assertTrue(any(f['rule']=='board-edge'and 'segment'in f for f in failures))
        self.assertTrue(any(f['rule']=='board-edge'and f.get('via')==[2,1]for f in failures))

    def test_via_must_keep_signal_spacing_even_when_fab_clearance_passes(self):
        board, jobs, results = fixture()
        board += [{'type': 'source_port', 'source_port_id': 'foreign'},
                  {'type': 'pcb_port', 'pcb_port_id': 'foreign', 'source_port_id': 'foreign'},
                  {'type': 'pcb_smtpad', 'pcb_port_id': 'foreign', 'pcb_component_id': 'foreign',
                   'shape': 'circle', 'x': 2, 'y': 1.46, 'radius': .15, 'layer': 'top'}]
        row = audit(board, jobs, results)['nets'][0]
        failure = next(f for f in row['failures'] if f['rule'] == 'via-copper')
        self.assertGreater(failure['gapMm'], .125)
        self.assertEqual(failure['requiredMm'], .2032)

    def test_missing_net_or_disconnected_copper_cannot_pass(self):
        board, jobs, results = fixture()
        self.assertFalse(audit(board, jobs, [])['passed'])
        results[0]['traces'][0]['route'] = results[0]['traces'][0]['route'][:4]
        self.assertIn('physical-connectivity', [f['rule'] for f in audit(board, jobs, results)['nets'][0]['failures']])


if __name__ == '__main__': unittest.main()
