import {test, expect} from 'bun:test';
import {RootCircuit} from 'tscircuit';
import {nativeControlRouting} from '../lib/control-native-autorouter.mjs';
import {controlNetProperties} from '../components/ControlRouting';

function diagnosticRouter(onInput) {
  return async input => ({
    on(name, callback) {this[name] = callback;},
    start() {onInput(input); this.complete({traces: []});},
    stop() {},
  });
}

test('native remaining pass freezes pcbPaths copper and preserves its intentional detour', async () => {
  let input;
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
  circuit.schematicDisabled = true;
  circuit.add(<board width={24} height={18} layers={6} routeRemaining={true}
    autorouter={{algorithmFn: diagnosticRouter(srj => {input = srj;})}}>
    <resistor name="A" resistance="1k" footprint="0402" pcbX={-8} pcbY={0}/>
    <resistor name="B" resistance="1k" footprint="0402" pcbX={8} pcbY={0}/>
    <trace name="FIXED_PATHS" from="A.pin2" to="B.pin1" width={.3}
      pcbPathRelativeTo="A.pin2" pcbPaths={[["A.pin2", {x:0,y:2}, {x:14.98,y:2}, "B.pin1"]]}/>
    <resistor name="C" resistance="1k" footprint="0402" pcbX={0} pcbY={-6}/>
    <resistor name="D" resistance="1k" footprint="0402" pcbX={0} pcbY={6}/>
    <trace from="C.pin2" to="D.pin1"/>
  </board>);
  await circuit.renderUntilSettled();
  expect(input).toBeDefined();
  expect(input.traces?.length ?? 0).toBe(0);
  expect(input.obstacles.some(o => o.width > 10 && Math.abs(o.center.y - 2) < 1e-6)).toBe(true);
  const source = circuit.getCircuitJson().find(e => e.type === 'source_trace' && e.name === 'FIXED_PATHS');
  const fixed = circuit.getCircuitJson().filter(e => e.type === 'pcb_trace' && e.source_trace_id === source.source_trace_id);
  expect(fixed.length).toBe(1);
  expect(fixed[0].route.some(p => p.y === 2)).toBe(true);
  expect(circuit.getCircuitJson().filter(e => e.type === 'pcb_autorouting_error')).toEqual([]);
});

test('a named control net reaches its explicit native phase with its width and clearance', async () => {
  let selected;
  const remaining = [];
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
  circuit.schematicDisabled = true;
  circuit.add(<board width={12} height={8} layers={6} routeRemaining={true}
    autorouter={{algorithmFn: diagnosticRouter(input => remaining.push(...input.connections))}}>
    <net name="ASM_SPI_CLK" {...controlNetProperties('ASM_SPI_CLK')}/>
    <resistor name="A" resistance="1k" footprint="0402" pcbX={-3} connections={{pin2:'net.ASM_SPI_CLK'}}/>
    <resistor name="B" resistance="1k" footprint="0402" pcbX={3} connections={{pin1:'net.ASM_SPI_CLK'}}/>
    <autoroutingphase phaseIndex={23} connections={['A.pin2','B.pin1']}
      minTraceWidth={.127} minTraceToPadEdgeClearance={.254}
      algorithmFn={diagnosticRouter(input => {selected=input;})}/>
  </board>);
  await circuit.renderUntilSettled();
  expect(selected?.connections.length).toBe(1);
  expect(selected.minTraceWidth).toBe(.127);
  expect(selected.minTraceToPadEdgeClearance).toBe(.254);
  expect(selected.connections[0].nominalTraceWidth).toBe(.127);
  expect(remaining).toEqual([]);
  expect(circuit.getCircuitJson().filter(e => e.type === 'pcb_autorouting_error')).toEqual([]);
});

const job = {name: 'test', rule: {widthMm: .2032, clearanceMm: .381, maxLengthMm: 254},
  terminals: [{selector: 'A.pin1', pcb_port_id: 'a', x:1,y:2,layers:['top']},
    {selector:'B.pin1',pcb_port_id:'b',x:9,y:2,layers:['top']}],
  simpleRouteJson: {layerCount:6, minTraceWidth:.2032, minTraceToPadEdgeClearance:.381,
    bounds:{minX:0,maxX:10,minY:0,maxY:5}, obstacles:[], traces:[],connections:[],buses:[]}};
const phase = () => ({minTraceWidth:.2032,minTraceToPadEdgeClearance:.381,
  connections:[{name:'native-net',pointsToConnect:job.terminals.map(t=>({x:t.x,y:t.y}))}]});
const run = instance => new Promise((resolve,reject) => {
  instance.on('complete',resolve);instance.on('error',e=>reject(e.error));instance.start();
});
test('native callback supplies edge spacing and two-surface search input, without generating diagnostic copper', async () => {
  let captured;
  const routing=nativeControlRouting({jobs:[job],captureOnly:true,onInput:r=>{captured=r;}});
  const result=await run(await routing.algorithmForNet('test')(phase()));
  expect(result.traces).toEqual([]);
  expect(captured.solverInput.defaultObstacleMargin).toBe(.381);
  expect(captured.solverInput.minViaEdgeToPadEdgeClearance).toBe(.381);
  expect(captured.solverInput.layerCount).toBe(2);
  expect(captured.solverInput.traces).toEqual([]);
  expect(captured.solverInput.buses[0].allowedLayers).toEqual(['top','bottom']);
});
test('native callback rejects weakened phase rules and missing terminals', async () => {
  const routing=nativeControlRouting({jobs:[job],captureOnly:true});
  await expect(run(await routing.algorithmForNet('test')({...phase(),minTraceWidth:.1}))).rejects.toThrow('lost its width/clearance');
  await expect(run(await routing.algorithmForNet('test')({...phase(),connections:[]}))).rejects.toThrow('omitted pads');
});
test('routeRemaining cannot silently route an unconfigured net with generic defaults', async () => {
  const routing=nativeControlRouting({jobs:[]});
  await expect(run(await routing.remainingAlgorithm(phase()))).rejects.toThrow('explicit routing policy');
});
