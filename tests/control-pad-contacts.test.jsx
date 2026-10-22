import {test,expect} from 'bun:test';
import {RootCircuit} from 'tscircuit';
import {checkTracesAreContiguous,checkEachPcbPortConnectedToPcbTraces,checkSourceTracesHavePcbTraces} from '@tscircuit/checks';
import {FixedTrace} from '../components/FixedTrace';

async function render(endX=43.89){
  const circuit=new RootCircuit({platform:{partsEngineDisabled:true,routingDrcChecksDisabled:true}});
  circuit.add(<board width={100} height={220} routeRemaining={false}>
    <resistor name="A" resistance="1k" footprint="0402" pcbX={40.65} pcbY={98}/>
    <resistor name="B" resistance="1k" footprint="0402" pcbX={44.65} pcbY={98}/>
    <via name="USB4_GND_RETURN_0" pcbX={42.65} pcbY={100.74475} outerDiameter={.3} holeDiameter={.2} connectsTo="net.GND"/>
    <FixedTrace name="EDGE" from="A.pin2" to="B.pin1" width={.2032}
      points={[[41.41,98],[endX,98]]} exactPadContacts/>
  </board>);
  await circuit.renderUntilSettled();return circuit.getCircuitJson();
}

test('exact pad contacts preserve off-centre endpoints and pass native connectivity',async()=>{
  const json=await render(),trace=json.find(e=>e.type==='pcb_trace');
  expect(trace.route[0].x).toBeCloseTo(41.41,8);
  expect(trace.route.at(-1).x).toBeCloseTo(43.89,8);
  expect(checkTracesAreContiguous(json)).toEqual([]);
  expect(checkEachPcbPortConnectedToPcbTraces(json)).toEqual([]);
  expect(checkSourceTracesHavePcbTraces(json)).toEqual([]);
});

test('native connectivity rejects an endpoint outside the pad even if its round cap overlaps',async()=>{
  const json=await render(43.8);
  expect(checkTracesAreContiguous(json).length).toBeGreaterThan(0);
});
