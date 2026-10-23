import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RootCircuit} from 'tscircuit';
import {scopeAutoroutingPhases} from '../lib/scope-autorouting-phases';
test('a saved phase in a child subcircuit is not replayed by its parent',async()=>{
 const c=new RootCircuit({platform:{partsEngineDisabled:true}});
 c.add(<board width={30} height={15} routingDisabled routeRemaining={false}
  ref={group=>{if(group)scopeAutoroutingPhases(group);}}>
  <resistor name="A" resistance="1k" footprint="0402" pcbX={-10} schX={-10}/>
  <resistor name="B" resistance="1k" footprint="0402" pcbX={-6} schX={-6}/>
  <trace name="ROOT" from="A.pin1" to="B.pin1" routingPhaseIndex={0}/>
  <autoroutingphase name="ROOT_PHASE" phaseIndex={0} pcbTracePaths={[]}/>
  <subcircuit name="CHILD" pcbX={7} schX={7}
   ref={group=>{if(group)scopeAutoroutingPhases(group);}}>
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

test('phase scoping filters cached cross-subcircuit matches without changing other selectors',async()=>{
 const c=new RootCircuit({platform:{partsEngineDisabled:true}});
 c.add(<board width={30} height={15} routingDisabled>
  <group name="ROOT_GROUP">
   <autoroutingphase name="ROOT_PHASE" phaseIndex={0} pcbTracePaths={[]}/>
  </group>
  <subcircuit name="CHILD">
   <autoroutingphase name="LOCAL_PHASE" phaseIndex={1} pcbTracePaths={[]}/>
   <subcircuit name="GRANDCHILD">
    <autoroutingphase name="NESTED_PHASE" phaseIndex={2} pcbTracePaths={[]}/>
   </subcircuit>
  </subcircuit>
 </board>);
 const board=c._getBoard(),child=board.children.find(group=>group.name==='CHILD');
 board.parent=c;
 const grandchild=child.children.find(group=>group.name==='GRANDCHILD');
 // Reproduce the cross-subcircuit query results cached by the preview bundle.
 const nestedPhases=grandchild.selectAll('autoroutingphase');
 const childPhases=[...child.selectAll('autoroutingphase'),...nestedPhases];
 board._cachedSelectAllQueries.set('autoroutingphase',[
  ...board.selectAll('autoroutingphase'),...childPhases,
 ]);
 child._cachedSelectAllQueries.set('autoroutingphase',childPhases);
 const phases=board.selectAll('autoroutingphase');
 const allPhases=[...phases];
 assert.ok(phases.some(phase=>phase.name==='LOCAL_PHASE'), 'reproduces the preview selector leak');
 const groups=board.selectAll('group');
 scopeAutoroutingPhases(board);
 scopeAutoroutingPhases(child);
 assert.deepEqual(board.selectAll('autoroutingphase').map(phase=>phase.name),['ROOT_PHASE']);
 assert.deepEqual(child.selectAll('autoroutingphase').map(phase=>phase.name),['LOCAL_PHASE']);
 assert.deepEqual(phases,allPhases,'the native cached matches remain intact');
 assert.equal(board.selectAll('group'),groups,'other selectors retain native behavior');
 const scopedSelectAll=board.selectAll;
 scopeAutoroutingPhases(board);
 assert.equal(board.selectAll,scopedSelectAll,'installation is idempotent');
});
