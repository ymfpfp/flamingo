import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RootCircuit} from 'tscircuit';
test('a saved phase in a child subcircuit is not replayed by its parent',async()=>{
 const c=new RootCircuit({platform:{partsEngineDisabled:true}});
 c.add(<board width={30} height={15} routingDisabled routeRemaining={false}>
  <resistor name="A" resistance="1k" footprint="0402" pcbX={-10} schX={-10}/>
  <resistor name="B" resistance="1k" footprint="0402" pcbX={-6} schX={-6}/>
  <trace name="ROOT" from="A.pin1" to="B.pin1" routingPhaseIndex={0}/>
  <autoroutingphase name="ROOT_PHASE" phaseIndex={0} pcbTracePaths={[]}/>
  <subcircuit name="CHILD" pcbX={7} schX={7}>
   <resistor name="C" resistance="1k" footprint="0402" pcbX={-2} schX={-2}/>
   <resistor name="D" resistance="1k" footprint="0402" pcbX={2} schX={2}/>
   <trace name="LOCAL" from="C.pin1" to="D.pin1" routingPhaseIndex={1}/>
   <autoroutingphase name="LOCAL_PHASE" phaseIndex={1} pcbTracePaths={[]}/>
  </subcircuit>
 </board>);
 await c.renderUntilSettled();
 const board=c._getBoard(),child=board.children.find(c=>c.name==='CHILD');
 const named=group=>group._getRoutingPhasePlans().filter(p=>p.autoroutingPhase).map(p=>p.phaseName);
 assert.deepEqual(named(board),['ROOT_PHASE']);
 assert.deepEqual(named(child),['LOCAL_PHASE']);
});
