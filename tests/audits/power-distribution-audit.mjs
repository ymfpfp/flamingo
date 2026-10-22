// Inspect emitted power contacts and preserve the previous validated layout.
import terminals from "../../manufacturing/power-distribution/terminals.json";
import paths from "../../manufacturing/power-distribution/bga-escapes.json";
import capPaths from "../../manufacturing/power-distribution/cap-escapes.json";
import {assembledPlacements, checkAssemblyPlacement} from "./layout-audit.mjs";
function auditPowerDistribution(json) {
  const failures = checkAssemblyPlacement(json);
  const parts = assembledPlacements(json);
  const traces = new Map(json.filter(e => e.type === "pcb_trace").map(e => [e.pcb_trace_id, e]));
  const sources = new Map(json.filter((e) => e.type === "source_trace").map((e) => [e.source_trace_id, e]));
  const sourceParts=new Map(json.filter(e=>e.type==='source_component').map(e=>[e.source_component_id,e.name]));
  const endpoint=(selector,terminal,sourceTrace)=>{
    const [name,pin]=selector.split('.');
    const sp=json.find(e=>e.type==='source_port'&&sourceParts.get(e.source_component_id)===name&&e.port_hints.includes(pin));
    let pp=json.find(e=>e.type==='pcb_port'&&e.source_port_id===sp?.source_port_id);
    // Native JSON stores manually placed vias without their JSX names. Resolve
    // an explicit via owner through its saved site AND native trace-port ID.
    if(!pp&&terminal?.viaOwner&&selector===`${terminal.viaOwner}.${pin}`){
      const vias=json.filter(e=>e.type==='pcb_via'&&Math.hypot(e.x-terminal.x,e.y-terminal.y)<1e-7);
      if(vias.length===1)pp=json.find(e=>e.type==='pcb_port'&&vias[0].pcb_port_ids?.includes(e.pcb_port_id)
        &&e.layers.includes(pin)&&sourceTrace.connected_source_port_ids.includes(e.source_port_id));
    }
    if(!pp)throw Error(`Missing ground tap endpoint ${selector}`);
    return pp;
  };
  for (const p of [...capPaths, ...paths]) {
    const s = [...sources.values()].find((t2) => t2.name === `${p.name}_TRACE`);
    const found = [...traces.values()].filter((t2) => t2.source_trace_id === s?.source_trace_id);
    if (!s || found.length !== 1) {
      failures.push(`${p.name}: expected one correctly attributed contact route`);
      continue;
    }
    const t = found[0];
    const actual = t.route.filter((q) => q.route_type === "wire");
    if (actual.some((q) => q.layer !== "top" || q.width < 0.1 - 0.00000001))
      failures.push(`${p.name}: contact must stay on top at >=0.1 mm width`);
    const terminal = terminals.find((t2) => t2.name === p.name);
    for (const expected of [p.route[0], p.toSelector?endpoint(p.toSelector,terminal,s):{ x: terminal.x, y: terminal.y }])
      if (![actual[0], actual.at(-1)].some((q) => Math.hypot(q.x - expected.x, q.y - expected.y) < 0.0001))
        failures.push(`${p.name}: wrong physical contact endpoint`);
  }
  for (const rail of ["VCCL", "VDD"]) {
    const n = json.find((e) => e.type === "source_net" && e.name === rail);
    const layer = rail === "VCCL" ? "inner2" : "inner3";
    if (!json.some((e) => e.type === "pcb_copper_pour" && e.source_net_id === n?.source_net_id && e.layer === layer))
      failures.push(`${rail}: missing assigned power region`);
  }
  return {
    passed: !failures.length,
    failures,
    assembledComponentsOnTop: parts.filter((p) => p.layer === "top").length,
    contactRoutes: paths.length + capPaths.length,
    scope: "Fixed placement, named contact geometry and assigned L3/L4 regions. Physical copper and DC screens are separate required checks.",
    limitations: "No AC PDN, package model, load-step or thermal qualification. ASMedia maximum rail currents remain TBD in the available datasheet."
  };
}
export {auditPowerDistribution};
