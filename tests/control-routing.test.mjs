import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {buildControlRoutingJobs, buildMultilayerControlInput, checkControlPreservation, solveControlNet, pruneCoveredControlObstacles} from '../lib/control-routing.mjs';
import {controlNets, controlProfiles} from '../lib/control-routing-config.mjs';

const fixture = process.env.CONTROL_ROUTING_FIXTURE;
const raw = fixture ? JSON.parse(readFileSync(fixture)) : null;
const json = raw ? raw.circuitJson ?? raw : null;
const fixtureTest = fixture ? test : (name, run) => test.skip(name, run);
const baseline = JSON.parse(readFileSync('manufacturing/control-routing/preserved-layout.json'));

fixtureTest('baseline keeps every assembled component on top and preserves all existing copper', () => {
  const result = checkControlPreservation(json, baseline);
  expect(result.passed).toBe(true);
  expect(result.preservedTraceCount).toBe(520);
  expect(result.preservedViaCount).toBe(536);
});

for (const [type, key, mutate] of [
  ['pcb_trace', 'route', e => { e.route[1].x += .05; }],
  ['pcb_via', 'x', e => { e.x += .05; }],
  ['pcb_copper_pour', 'layer', e => { e.layer = 'bottom'; }],
  ['pcb_component', 'layer', e => { e.layer = 'bottom'; }],
]) fixtureTest(`rejects changed existing ${type} ${key}`, () => {
  const altered = structuredClone(json);
  const target = altered.find(e => e.type === type && (type !== 'pcb_component' || !e.source_component_id.startsWith('source_manually_placed_via_')));
  mutate(target);
  expect(checkControlPreservation(altered, baseline).passed).toBe(false);
});

fixtureTest('all control terminals resolve to real pads on their intended electrical net', () => {
  const jobs = buildControlRoutingJobs(json);
  expect(jobs.length).toBe(22);
  expect(jobs.every(j => j.terminals.length === controlNets.find(n => n.name === j.name).terminals.length)).toBe(true);
  expect(jobs.every(j => j.simpleRouteJson.allowedLayers.join() === 'top,bottom')).toBe(true);
  for (const job of jobs) {
    expect(job.simpleRouteJson.minTraceToPadEdgeClearance).toBe(controlProfiles[job.profile].clearanceMm);
    expect(job.simpleRouteJson.traces.length).toBeGreaterThan(450);
    expect(job.simpleRouteJson.obstacles.some(o => o.circuitJsonMetadata?.pcb_copper_pour_id)).toBe(true);
    expect(new Set(job.simpleRouteJson.obstacles.map(o => o.circuitJsonMetadata?.pcb_via_id).filter(Boolean)).size).toBe(536);
  }
});

fixtureTest('a wrong endpoint cannot join two separate schematic nets', () => {
  const altered = structuredClone(json);
  const component = altered.find(e => e.type === 'source_component' && e.name === 'R_RST_N');
  const pad = altered.find(e => e.type === 'source_port' && e.source_component_id === component.source_component_id && e.port_hints.includes('pin1'));
  for (const trace of altered.filter(e => e.type === 'source_trace'))
    trace.connected_source_port_ids = trace.connected_source_port_ids.filter(id => id !== pad.source_port_id);
  expect(() => buildControlRoutingJobs(altered)).toThrow('Different electrical nets in REXT');
});

fixtureTest('rotated pill obstacles retain the actual emitted pad dimensions', () => {
  const pad = json.find(e => e.type === 'pcb_smtpad' && e.port_hints?.includes('AA2'));
  const obstacle = buildControlRoutingJobs(json)[0].simpleRouteJson.obstacles.find(o => o.circuitJsonMetadata?.pcb_smtpad_id === pad.pcb_smtpad_id);
  expect(obstacle.width).toBeCloseTo(pad.width, 8);
  expect(obstacle.height).toBeCloseTo(pad.height, 8);
  expect(obstacle.ccwRotationDegrees).toBeUndefined();
});

const routingFixture = () => ({name: 'test', rule: {widthMm: .127, clearanceMm: .2},
  terminals: [{selector: 'A.pin1', pcb_port_id: 'a', x: 1, y: 2, layers: ['top']},
    {selector: 'B.pin1', pcb_port_id: 'b', x: 9, y: 2, layers: ['top']}], simpleRouteJson: {
    layerCount: 6, minTraceWidth: .127, minTraceToPadEdgeClearance: .2,
    bounds: {minX: 0, maxX: 10, minY: 0, maxY: 5},
    obstacles: [{type: 'rect', center: {x: 5, y: 2.5}, width: 1, height: 5, layers: ['top'], connectedTo: []}],
    traces: [], connections: [{name: 'test', pointsToConnect: [{x: 1, y: 2, layer: 'top'}, {x: 9, y: 2, layer: 'top'}]}],
    buses: [],
  }});

test('contained reservations are removed without erasing own pads or another layer', () => {
  const rect=(x,w,layers,connectedTo=[])=>({type:'rect',center:{x,y:0},width:w,height:w,layers,connectedTo});
  const outer=rect(0,4,['top']);
  const nested=rect(0,1,['top']);
  const bottom=rect(0,1,['bottom']);
  const own=rect(0,.2,['top'],['test']);
  const result=pruneCoveredControlObstacles([outer,nested,bottom,own],['test']);
  expect(result.length).toBe(3);
  expect(result.some(o=>o.connectedTo.includes('test'))).toBe(true);
  expect(result.some(o=>o.layers.includes('bottom'))).toBe(true);
});

test('native multilayer router places its own vias to cross a top-only barrier', async () => {
  const job = routingFixture();
  const before = JSON.stringify(job);
  const routed = await solveControlNet(job, [], {timeoutMs: 10000, effort: 2});
  expect(routed.solved).toBe(true);
  const points = routed.traces.flatMap(t => t.route);
  expect(points.some(p => p.route_type === 'wire' && p.layer === 'bottom')).toBe(true);
  expect(points.filter(p => p.route_type === 'via').length).toBeGreaterThanOrEqual(2);
  expect(points.filter(p => p.route_type === 'via').every(p => p.layers.length === 6)).toBe(true);
  expect(points.filter(p => p.route_type === 'wire').every(p => p.width >= .127 && ['top', 'bottom'].includes(p.layer))).toBe(true);
  expect(JSON.stringify(job)).toBe(before);
});

test('native multilayer routing refuses an obstacle spanning both signal surfaces', async () => {
  const job = routingFixture();
  job.simpleRouteJson.obstacles[0].layers = ['top', 'bottom'];
  const blocked = await solveControlNet(job, [], {timeoutMs: 10000, effort: 2});
  expect(blocked.solved).toBe(false);
});

test('an explicit launch hands off on its real layer and retains the original terminal', async () => {
  const job=routingFixture();
  job.authoredLaunches=[{selector:'A.pin1',route:[
    {route_type:'wire',x:1,y:2,width:.127,layer:'top'},
    {route_type:'wire',x:2,y:2,width:.127,layer:'top'},
    {route_type:'via',x:2,y:2,via_diameter:.3,via_hole_diameter:.2,from_layer:'top',to_layer:'bottom'},
    {route_type:'wire',x:2,y:2,width:.127,layer:'bottom'},
  ]}];
  const before=JSON.stringify(job);
  const routed=await solveControlNet(job,[],{timeoutMs:10000,effort:2});
  expect(routed.solved).toBe(true);
  const raw=routed.traces.find(t=>t.route.some(p=>p.route_type==='wire'&&p.x===1&&p.y===2)).route;
  const route=raw[0].x===1?raw:[...raw].reverse().map(p=>p.route_type==='via'
    ?{...p,from_layer:p.to_layer,to_layer:p.from_layer}:p);
  expect(route.slice(0,4).map(p=>[p.route_type,p.x,p.y,p.layer??p.to_layer])).toEqual([
    ['wire',1,2,'top'],['wire',2,2,'top'],['via',2,2,'bottom'],['wire',2,2,'bottom'],
  ]);
  expect(JSON.stringify(job)).toBe(before);
});

test('existing traces become obstacles and are never exposed for preloaded-trace repair', () => {
  const job = routingFixture();
  const old = {type: 'pcb_trace', pcb_trace_id: 'fixed', connection_name: 'foreign',
    route: [{route_type: 'wire', x: 2, y: 4, width: .127, layer: 'top'}, {route_type: 'wire', x: 8, y: 4, width: .127, layer: 'top'}]};
  job.simpleRouteJson.traces = [old];
  const input = buildMultilayerControlInput(job);
  expect(input.traces.length).toBe(0);
  expect(input.obstacles.some(o => o.obstacleId?.startsWith('trace_obstacle_fixed'))).toBe(true);
  expect(input.obstacles.filter(o => o.obstacleId?.startsWith('fixed_cap_fixed_')).length).toBe(2);
  expect(old.route[0].x).toBe(2);
});

test('fixed copper cannot be assigned to a signal or bypassed by component-local topology', () => {
  const job = routingFixture();
  job.simpleRouteJson.obstacles[0] = {...job.simpleRouteJson.obstacles[0],
    componentId: 'fixed-chip', netIsAssignable: true, offBoardConnectsTo: ['ground'], zLayers: [0, 5],
    layers: ['top', 'bottom']};
  const obstacles = buildMultilayerControlInput(job).obstacles.filter(o => o.center.x === 5);
  expect(new Set(obstacles.flatMap(o => o.zLayers))).toEqual(new Set([0, 1]));
  for (const obstacle of obstacles) {
    expect(obstacle.componentId).toBeUndefined();
    expect(obstacle.netIsAssignable).toBeUndefined();
    expect(obstacle.offBoardConnectsTo).toBeUndefined();
    expect(obstacle.zLayers).toEqual(obstacle.layers.map(l => l === 'top' ? 0 : 1));
  }
});
