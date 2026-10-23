import {readFileSync} from 'node:fs';
import {getSimpleRouteJsonFromCircuitJson, SOLVERS} from 'tscircuit';
import {circuitGraph} from './circuit-graph.mjs';
import {assembledPlacements, layoutDigest, routeDigest} from './layout-geometry.mjs';
import {controlNets, controlProfiles, controlRoutingPolicy} from './control-routing-config.mjs';

// Exact containment reduction only: a foreign obstacle is redundant if one
// larger foreign rectangle already covers it on every affected layer. This
// removes duplicated pour/guard/trace reservations without opening any copper.
export function pruneCoveredControlObstacles(obstacles, ownNames) {
  const owned = new Set(ownNames);
  const own = obstacles.filter(o => o.connectedTo?.some(id => owned.has(id)));
  const foreign = obstacles.filter(o => !o.connectedTo?.some(id => owned.has(id)))
    .sort((a,b)=>b.width*b.height-a.width*a.height);
  const kept = [];
  for (const o of foreign) {
    const covered = kept.some(k => !k.shape && !k.ccwRotationDegrees &&
      o.layers.every(l=>k.layers.includes(l)) &&
      Math.abs(o.center.x-k.center.x)+o.width/2 <= k.width/2+1e-10 &&
      Math.abs(o.center.y-k.center.y)+o.height/2 <= k.height/2+1e-10);
    if (!covered) kept.push({...o, connectedTo:[]});
  }
  return [...own, ...kept];
}

export function controlPreservationManifest(json) {
  return {
    assembledPlacementSha256: layoutDigest(assembledPlacements(json)),
    assembledCount: assembledPlacements(json).length,
    traces: Object.fromEntries(json.filter(e => e.type === 'pcb_trace').map(t => [t.pcb_trace_id, routeDigest(t.route)])),
    vias: Object.fromEntries(json.filter(e => e.type === 'pcb_via').map(v => [v.pcb_via_id, layoutDigest(v)])),
    pours: Object.fromEntries(json.filter(e => e.type === 'pcb_copper_pour').map(p => [p.pcb_copper_pour_id, layoutDigest(p)])),
  };
}

export function checkControlPreservation(json, baseline) {
  const failures = [], current = controlPreservationManifest(json);
  if (current.assembledCount !== baseline.assembledCount || current.assembledPlacementSha256 !== baseline.assembledPlacementSha256)
    failures.push('Assembled component placement changed');
  if (assembledPlacements(json).some(p => p.layer !== 'top')) failures.push('All assembled components must remain on top');
  for (const type of ['traces', 'vias', 'pours'])
    for (const [id, digest] of Object.entries(baseline[type]))
      if (current[type][id] !== digest) failures.push(`Existing ${type} changed: ${id}`);
  return {passed: failures.length === 0, failures,
    preservedTraceCount: Object.keys(baseline.traces).length,
    preservedViaCount: Object.keys(baseline.vias).length,
    preservedPourCount: Object.keys(baseline.pours).length,
    topComponentCount: current.assembledCount};
}

export function buildControlRoutingJobs(json, {pourCover, additionalNets = []} = {}) {
  const graph = circuitGraph(json);
  const sources = new Map(json.filter(e => e.type === 'source_trace').map(t => [t.source_trace_id, t]));
  const {simpleRouteJson: srj} = getSimpleRouteJsonFromCircuitJson({circuitJson: json});
  const pads = new Map(json.filter(e => e.type === 'pcb_smtpad').map(p => [p.pcb_smtpad_id, p]));
  // The converter swaps width/height on some rotated pill pads. Use the
  // emitted pad dimensions, conservatively enclosed by a rotated rectangle,
  // so native search cannot pass through the omitted end of a real pad.
  srj.obstacles = srj.obstacles.map(o => {
    const p = pads.get(o.circuitJsonMetadata?.pcb_smtpad_id);
    if (!p) return o;
    if (p.shape === 'circle') return {...o, center: {x: p.x, y: p.y},
      width: 2*p.radius, height: 2*p.radius, shape: 'circle', ccwRotationDegrees: undefined};
    if (p.shape === 'polygon') {
      const xs = p.points.map(q => q.x), ys = p.points.map(q => q.y);
      return {...o, center: {x: (Math.min(...xs)+Math.max(...xs))/2, y: (Math.min(...ys)+Math.max(...ys))/2},
        width: Math.max(...xs)-Math.min(...xs), height: Math.max(...ys)-Math.min(...ys), shape: undefined, ccwRotationDegrees: undefined};
    }
    const angle = (p.ccw_rotation ?? 0)*Math.PI/180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
    return {...o, center: {x: p.x, y: p.y}, width: c*p.width+s*p.height, height: s*p.width+c*p.height,
      shape: undefined, ccwRotationDegrees: undefined};
  });
  // The converter repeats the complete ground-net connectivity list on every
  // ground obstacle. Collapse ownership once instead of copying that list
  // into every routing job.
  const obstacleRoots = srj.obstacles.map(o => new Set(o.connectedTo
    .filter(id => id.startsWith('source_port_') || id.startsWith('source_net_')).map(graph.root)));
  const representedVias = new Set(srj.obstacles.map(o => o.circuitJsonMetadata?.pcb_via_id).filter(Boolean));
  const missingViaObstacles = json.filter(e => e.type === 'pcb_via' && !representedVias.has(e.pcb_via_id)).map(v => ({
    type: 'rect', obstacleId: v.pcb_via_id, shape: 'circle', center: {x: v.x, y: v.y},
    width: v.outer_diameter, height: v.outer_diameter, layers: v.layers, connectedTo: [],
    circuitJsonMetadata: {pcb_via_id: v.pcb_via_id},
  }));
  const surfacePours = json.filter(e => e.type === 'pcb_copper_pour' && ['top', 'bottom'].includes(e.layer));
  if (surfacePours.length) {
    pourCover ??= JSON.parse(readFileSync('dist/control-routing/pour-obstacles.json'));
    if (pourCover.pourGeometrySha256 !== layoutDigest(surfacePours) || pourCover.missedCopperAreaMm2 > 1e-10)
      throw Error('Surface copper obstacles are stale or incomplete; rerun setup:controls');
  }
  const frozenPours = pourCover?.obstacles ?? [];
  if (pourCover?.isolationGeometrySha256 !== layoutDigest(json.filter(e => e.type === 'pcb_trace')))
    throw Error('High-speed isolation constraints are stale; rerun setup:controls');
  const port = selector => {
    const [part, pin] = selector.split('.'), sp = graph.port(part, pin);
    const pp = json.find(e => e.type === 'pcb_port' && e.source_port_id === sp.source_port_id);
    if (!pp) throw Error(`No physical terminal: ${selector}`);
    if (sp.do_not_connect) throw Error(`Cannot route an intentionally unused pin: ${selector}`);
    return {selector, sourcePortId: sp.source_port_id, ...pp};
  };
  const fixed = json.filter(e => e.type === 'pcb_trace');
  const pourRoots=new Map(json.filter(e=>e.type==='pcb_copper_pour').map(p=>[p.pcb_copper_pour_id,graph.root(p.source_net_id)]));
  const pcbPorts=new Map(json.filter(e=>e.type==='pcb_port').map(p=>[p.pcb_port_id,p]));
  const viaRoots=new Map(json.filter(e=>e.type==='pcb_via').map(v=>{
    const s=sources.get(v.source_trace_id ?? fixed.find(t=>t.pcb_trace_id===v.pcb_trace_id)?.source_trace_id);
    const id=v.source_net_id ?? s?.connected_source_port_ids[0] ?? s?.connected_source_net_ids[0] ??
      v.pcb_port_ids?.map(id=>pcbPorts.get(id)?.source_port_id).find(Boolean);
    return [v.pcb_via_id,id ? graph.root(id) : null];
  }));
  const jobs = [];
  for (const spec of [...controlNets,...additionalNets]) {
    const profile = spec.rule ?? controlProfiles[spec.profile], terminals = spec.terminals.map(port);
    const root = graph.root(terminals[0].sourcePortId);
    if (terminals.some(p => graph.root(p.sourcePortId) !== root)) throw Error(`Different electrical nets in ${spec.name}`);
    const sourceNet = json.find(e => e.type === 'source_net' && e.name === spec.name);
    if (sourceNet && graph.root(sourceNet.source_net_id) !== root) throw Error(`Wrong source net for ${spec.name}`);
    const foreignFixed = fixed.filter(t => {
      const s = sources.get(t.source_trace_id);
      if (!s) throw Error(`Unattributed existing trace: ${t.pcb_trace_id}`);
      return graph.root(s.connected_source_port_ids[0] ?? s.connected_source_net_ids[0]) !== root;
    });
    const branchNames = terminals.slice(1).map((_, index) => `${spec.name}_${index}`);
    const obstacles = [...srj.obstacles.map((o, i) => ({...o,
      connectedTo: obstacleRoots[i].has(root) || terminals.some(p => p.pcb_port_id === o.circuitJsonMetadata?.pcb_port_id)
        ? [spec.name, ...branchNames] : []})),
      ...missingViaObstacles.map(o=>({...o,connectedTo:viaRoots.get(o.circuitJsonMetadata.pcb_via_id)===root?[spec.name,...branchNames]:[]})),
      ...(pourCover?.cutoutObstacles ?? []),
      ...frozenPours.map(o=>({...o,connectedTo:pourRoots.get(o.circuitJsonMetadata?.pcb_copper_pour_id)===root?[spec.name,...branchNames]:[]})),
      ...(pourCover?.isolationObstacles ?? []).map(o => {
        const extra = Math.max(0, o.requiredGapMm - profile.clearanceMm);
        return {...o, width:o.width+2*extra, height:o.height+2*extra};
      })];
    // Inventory of the required joins. The multilayer solver receives all
    // terminals together and chooses its own connection topology.
    const branches = terminals.slice(1).map((b, index) => {
      const a = terminals[index], name = `${spec.name}_${index}`;
      const source = [...sources.values()].find(s =>
        s.connected_source_port_ids.includes(a.sourcePortId) && s.connected_source_port_ids.includes(b.sourcePortId))
        ?? [...sources.values()].find(s => (s.connected_source_port_ids.length || s.connected_source_net_ids.length)
          && graph.root(s.connected_source_port_ids[0] ?? s.connected_source_net_ids[0]) === root);
      if (!source) throw Error(`No schematic source connection: ${name}`);
      return {name, sourceTraceId: source.source_trace_id, from: a.selector, to: b.selector,
        pointsToConnect: [a, b].map(p => ({x: p.x, y: p.y, layer: 'top', pointId: p.pcb_port_id, pcb_port_id: p.pcb_port_id})),
        availableTerminalLayers: [a.layers, b.layers]};
    });
    jobs.push({name: spec.name, profile: spec.profile, rule: profile, terminals, branches,
      allowedSignalLayers: controlRoutingPolicy.authoredSignalLayersByNet[spec.name] ?? controlRoutingPolicy.allowedSignalLayers,
      ...(controlRoutingPolicy.fixedPadLaunchPolicies[spec.name] ? {fixedPadLaunchPolicy:controlRoutingPolicy.fixedPadLaunchPolicies[spec.name]} : {}),
      simpleRouteJson: {...srj, outline: undefined, differentialPairs: [],
        allowedLayers: controlRoutingPolicy.allowedSignalLayers, layerCount: 6,
        minTraceWidth: profile.widthMm, nominalTraceWidth: profile.widthMm,
        minTraceToPadEdgeClearance: profile.clearanceMm, defaultObstacleMargin: profile.clearanceMm,
        minBoardEdgeClearance: .2, minViaDiameter: .3, minViaPadDiameter: .3,
        minViaHoleDiameter: .2, min_via_pad_diameter: .3, min_via_hole_diameter: .2,
        minViaEdgeToPadEdgeClearance: Math.max(.125, profile.clearanceMm),
        minViaHoleEdgeToViaHoleEdgeClearance: .2, allowBlindAndBuriedVias: false,
        obstacles, traces: foreignFixed,
        connections: branches.map(b => ({name: b.name, netConnectionName: spec.name,
          source_trace_id: b.sourceTraceId, width: profile.widthMm, nominalTraceWidth: profile.widthMm,
          pointsToConnect: b.pointsToConnect})),
        buses: branches.map(b => ({name: b.name, connectionNames: [b.name], traceWidth: profile.widthMm,
          preferredLayer: 'top', maxLength: profile.maxLengthMm}))},
      routingMode: 'automatic-multilayer',
    });
  }
  return jobs;
}

// Restrict routing to the two outer surfaces of the physical six-layer board.
// Existing internal wires remain untouched. Every physical via is represented
// on both surfaces, and new via barrels require the separate six-layer audit.
export function buildMultilayerControlInput(job, preceding = [], {fullStack = false} = {}) {
  const physicalLayers=['top','inner1','inner2','inner3','inner4','bottom'];
  const surfaces = new Set(fullStack ? physicalLayers : ['top', 'bottom']);
  const zLayer=l=>fullStack ? physicalLayers.indexOf(l) : l==='top' ? 0 : 1;
  const fixedCopper = (o, i) => {
    const {componentId, netIsAssignable, offBoardConnectsTo, zLayers, __zLayers, ...fixed} = o;
    const sourceName=o.circuitJsonMetadata?.source_component_name;
    const terminalComponent=sourceName && job.terminals.some(t=>t.selector.split('.')[0]===sourceName);
    const keepComponent=job.nativeComponentTopology && terminalComponent &&
      (job.nativeComponentTopology==='all' || sourceName!=='ASM2464PDX');
    return {...fixed, obstacleId: fixed.obstacleId ?? `fixed_${i}`,
      ...(keepComponent?{componentId:sourceName}:{}),
      zLayers: fixed.layers.map(zLayer), __zLayers: fixed.layers.map(zLayer)};
  };
  const srj = job.simpleRouteJson;
  const padding = job.routingPaddingMm ?? 6;
  const bounds = {minX: Math.max(srj.bounds.minX, Math.min(...job.terminals.map(p => p.x)) - padding),
    maxX: Math.min(srj.bounds.maxX, Math.max(...job.terminals.map(p => p.x)) + padding),
    minY: Math.max(srj.bounds.minY, Math.min(...job.terminals.map(p => p.y)) - padding),
    maxY: Math.min(srj.bounds.maxY, Math.max(...job.terminals.map(p => p.y)) + padding)};
  const fixed = [...srj.traces, ...preceding.filter(t => t.net !== job.name).map(t => ({...t.trace,
    route: t.trace.route.map(p => {
      const extra = 2 * Math.max(0, t.clearanceMm - job.rule.clearanceMm);
      return p.route_type === 'wire' ? {...p, width: p.width + extra}
        : p.route_type === 'via' ? {...p, via_diameter: (p.via_diameter ?? .3) + extra} : p;
    })}))];
  const outerSections = [];
  const traceViaObstacles = [];
  const traceCapObstacles = [];
  for (const trace of fixed) {
    for (const point of trace.route.filter(p => p.route_type === 'via'))
      traceViaObstacles.push({type: 'rect', shape: 'circle',
        center: {x: point.x, y: point.y}, width: point.via_diameter ?? .3,
        height: point.via_diameter ?? .3, layers: fullStack ? physicalLayers : ['top', 'bottom'], connectedTo: []});
    let section = [];
    const save = () => {if (section.length > 1) outerSections.push({...trace,
      pcb_trace_id: `${trace.pcb_trace_id}_surface_${outerSections.length}`, route: section}); section = [];};
    for (const point of trace.route) {
      if (point.route_type !== 'wire' || !surfaces.has(point.layer)) {save(); continue;}
      // Native trace-to-rectangle preprocessing covers diagonal segment bodies
      // but can miss part of their round caps. A square enclosing each cap is
      // conservative and prevents a later router from using that omitted area.
      const diameter = Math.max(point.width, point.end_width ?? point.width);
      traceCapObstacles.push({type: 'rect', obstacleId: `fixed_cap_${trace.pcb_trace_id}_${traceCapObstacles.length}`,
        center: {x: point.x, y: point.y}, width: diameter, height: diameter,
        layers: [point.layer], connectedTo: []});
      if (section.length && section.at(-1).layer !== point.layer) save();
      section.push(point);
    }
    save();
  }
  const hasBga = job.terminals.some(t => t.selector.startsWith('ASM2464PDX.'));
  const viaDiameter = hasBga ? controlRoutingPolicy.bgaViaDiameterMm : controlRoutingPolicy.viaDiameterMm;
  const viaHole = hasBga ? controlRoutingPolicy.bgaViaHoleDiameterMm : controlRoutingPolicy.viaHoleDiameterMm;
  const planned=job.plannedTerminalVias ?? [];
  const plannedPads=planned.map(contact=>{
    const p=job.terminals.find(t=>t.selector===contact.selector);
    if(!p)throw Error('Planned via is not on an inventoried terminal');
    return {type:'rect',shape:'circle',center:{x:p.x,y:p.y},width:contact.diameterMm,height:contact.diameterMm,
      layers:fullStack?physicalLayers:['top','bottom'],connectedTo:[job.name]};
  });
  const input = {...srj, bounds, layerCount: fullStack ? 6 : 2, allowBlindAndBuriedVias: false, allowJumpers: false,
    allowViaInPad: true, defaultObstacleMargin: job.rule.clearanceMm,
    minViaDiameter: viaDiameter, minViaPadDiameter: viaDiameter, min_via_pad_diameter: viaDiameter,
    minViaHoleDiameter: viaHole, min_via_hole_diameter: viaHole,
    minViaEdgeToPadEdgeClearance: Math.max(.125, job.rule.clearanceMm),
    obstacles: [...srj.obstacles, ...traceViaObstacles, ...traceCapObstacles,...plannedPads].map(o => ({...o, layers: o.layers.filter(l => surfaces.has(l))}))
      .filter(o => o.layers.length && o.center.x + o.width/2 >= bounds.minX && o.center.x - o.width/2 <= bounds.maxX
        && o.center.y + o.height/2 >= bounds.minY && o.center.y - o.height/2 <= bounds.maxY).map(fixedCopper),
    traces: outerSections,
    connections: [{name: job.name, netConnectionName: job.name, nominalTraceWidth: job.rule.widthMm,
      pointsToConnect: job.terminals.map(t => ({x: t.x, y: t.y, pcb_port_id: t.pcb_port_id,
        pointId: t.pcb_port_id, port_selector: t.selector,
        ...(t.routingLayers?{layers:t.routingLayers}:planned.some(p=>p.selector===t.selector)?{layers:job.forcePlannedViaBottom?['bottom']:['top','bottom']}:
          t.layers.includes('bottom') ? {layers: ['top', 'bottom']} : {layer: 'top'})}))}],
    buses: [{busId: job.name, name: job.name, connectionNames: [job.name],
      traceWidth: job.rule.widthMm, allowedLayers: ['top', 'bottom'], preferredLayer: 'top'}], differentialPairs: [],
  };
  // Pipeline 8's documented preprocessing turns pre-existing traces into
  // fixed obstacles. Pipeline 9 then gets no editable preloaded traces.
  // Neither solver is permitted to take ownership of the original copper.
  const freeze = new SOLVERS.AutoroutingPipelineSolver8(input, {cacheProvider: null});
  freeze.solveUntilPhase('escapeViaLocationSolver');
  if (freeze.failed || !freeze.preprocessSimpleRouteJsonSolver?.solved)
    throw Error('Native fixed-copper preprocessing failed: ' + freeze.error);
  const frozen = freeze.preprocessSimpleRouteJsonSolver.getOutputSimpleRouteJson();
  const normalized = frozen.obstacles.map((o, i) => {
    // Every emitted pad is fixed copper, including unused/NC pads. Generic
    // global obstacle routing avoids the component-local topology's pad
    // escape approximations. Ground copper is never assignable to a signal.
    const extra = o.connectedTo?.includes(job.name) ? 0 : (job.nativeExtraClearanceMm ?? 0);
    return fixedCopper({...o, width:o.width + 2*extra, height:o.height + 2*extra}, i);
  });
  const expanded=job.nativeClearanceGeometry ? normalized.map(o=>o.connectedTo?.includes(job.name)?o:
    {...o,width:o.width+2*job.rule.clearanceMm,height:o.height+2*job.rule.clearanceMm}) : normalized;
  if(job.exactObstacleCover) {
    if(job.exactObstacleCover.net!==job.name || job.exactObstacleCover.checks.some(c=>c.missedAreaMm2>1e-10))
      throw Error('Exact obstacle coverage does not match this net');
    const own=normalized.filter(o=>o.connectedTo?.includes(job.name));
    return {...frozen,traces:[],defaultObstacleMargin:0,minTraceToPadEdgeClearance:0,minViaEdgeToPadEdgeClearance:0,
      obstacles:[...own,...job.exactObstacleCover.obstacles.map(fixedCopper)]};
  }
  return {...frozen, traces: [],
    ...(job.nativeClearanceGeometry?{defaultObstacleMargin:0,minTraceToPadEdgeClearance:0,minViaEdgeToPadEdgeClearance:0}:{}),
    obstacles: job.pruneObstacles ? pruneCoveredControlObstacles(expanded,
      [job.name, ...job.terminals.slice(1).map((_,i)=>`${job.name}_${i}`)]) : expanded};
}

export async function solveControlNet(job, preceding = [], {timeoutMs = 60000, effort = 3, solverVersion = 9, onProgress} = {}) {
  // Explicit, independently checked short launches may hand off to native
  // global routing. This changes endpoints, not the native path search.
  const launches=job.authoredLaunches ?? [];
  const searchJob=launches.length ? {...job,
    terminals:job.terminals.map(t=>{
      const l=launches.find(l=>l.selector===t.selector),p=l?.route.at(-1);
      return p?{...t,x:p.x,y:p.y,routingLayers:[p.layer]}:t;
    }),
    plannedTerminalVias:[...(job.plannedTerminalVias??[]),...launches.map(l=>{
      const v=l.route.find(p=>p.route_type==='via');
      return {selector:l.selector,diameterMm:v.via_diameter,holeMm:v.via_hole_diameter};
    })]}:job;
  const input = buildMultilayerControlInput(solverVersion === 'fanout-pipeline'
    ? {...searchJob,routingPaddingMm:Math.max(job.routingPaddingMm ?? 6,12)} : searchJob, preceding);
  const start = performance.now();
  const stepToCompletion = async (solver, label) => {
    let lastPhase;
    while (!solver.solved && !solver.failed) {
      solver.step();
      const phase = solver.getCurrentPhase?.() ?? solver.activeSubSolver?.getSolverName?.() ?? solver.getSolverName();
      if (phase !== lastPhase) {onProgress?.(`${label}${phase}`); lastPhase = phase;}
      if (performance.now() - start > timeoutMs)
        return {solved:false,reason:'Search time budget exceeded',phase,elapsedMs:performance.now()-start};
      if (solver.iterations % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return solver.solved ? null : {solved:false,reason:solver.error ?? 'Native routing failed',phase:solver.getCurrentPhase?.()};
  };
  let solver;
  if(solverVersion==='boundary') {
    if(job.terminals.length!==2)throw Error('Native boundary routing requires an explicit two-terminal branch');
    const points=input.connections[0].pointsToConnect;
    const a=points[0],b=points[1];
    const sourceLayer=a.layer ?? a.layers[0],targetLayer=b.layer ?? b.layers[0];
    const horizontal=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y);
    const direction=horizontal?(b.x>=a.x?'right':'left'):(b.y>=a.y?'up':'down');
    const edge=direction==='up'?'top':direction==='down'?'bottom':direction;
    const boundary={...input.bounds};
    if(edge==='right')boundary.maxX=b.x;
    if(edge==='left')boundary.minX=b.x;
    if(edge==='top')boundary.maxY=b.y;
    if(edge==='bottom')boundary.minY=b.y;
    const source='native_contact_source';
    // The source is the inventoried pad or the separately checked planned via
    // contact on its requested layer. Other physical copper stays fixed.
    input.obstacles=input.obstacles.map(o=>{
      const {componentId,...fixed}=o;
      return Math.hypot(o.center.x-a.x,o.center.y-a.y)<1e-6&&o.layers.includes(sourceLayer)&&o.connectedTo.includes(job.name)
        ? {...fixed,componentId:source} : fixed;
    });
    const bus={busId:job.name,connectionNames:[job.name],sourceComponentId:source,direction,
      preferredExit:edge,allowedLayers:['top','bottom'],
      connectionExitTargets:{[job.name]:{x:b.x,y:b.y,layer:targetLayer}}};
    input.buses=[bus];
    solver=new SOLVERS.FanoutSolver(input,{sourceComponentId:source,sharedBoundary:boundary,
      traceWidth:job.rule.widthMm,clearance:(job.exactObstacleCover||job.nativeClearanceGeometry) ? .000001 : job.rule.clearanceMm,
      viaDiameter:input.minViaPadDiameter,viaHoleDiameter:input.minViaHoleDiameter,
      escapeLayers:['top','bottom'],allowBlindAndBuriedVias:false,allowSameNetMerges:true,
      buses:[bus],completeOriginalEndpoints:false});
  } else if (solverVersion === 'fanout-pipeline') {
    const origin=job.terminals[0], sourceName=origin.selector.split('.')[0];
    const componentId='control_source';
    input.obstacles=input.obstacles.map(o=>o.circuitJsonMetadata?.source_component_name===sourceName
      ? {...o,componentId} : o);
    const pads=input.obstacles.filter(o=>o.componentId===componentId);
    if (!pads.length) throw Error('Native fanout source pads are missing');
    const field={minX:Math.min(...pads.map(p=>p.center.x-p.width/2))-.6,
      maxX:Math.max(...pads.map(p=>p.center.x+p.width/2))+.6,
      minY:Math.min(...pads.map(p=>p.center.y-p.height/2))-.6,
      maxY:Math.max(...pads.map(p=>p.center.y+p.height/2))+.6};
    if(field.minX<input.bounds.minX || field.maxX>input.bounds.maxX ||
       field.minY<input.bounds.minY || field.maxY>input.bounds.maxY)
      throw Error('Fanout source field exceeds the obstacle-covered routing bounds');
    const fanout=new SOLVERS.FanoutSolver(input,{sourceComponentId:componentId,
      sharedBoundary:field,
      singleLayerAdaptiveExits:true,compactBusTracks:true,
      traceWidth:job.rule.widthMm,clearance:job.rule.clearanceMm,
      viaDiameter:input.minViaPadDiameter,viaHoleDiameter:input.minViaHoleDiameter,
      escapeLayers:['top','bottom'],allowBlindAndBuriedVias:false,allowSameNetMerges:true,
      completeOriginalEndpoints:false});
    const failure=await stepToCompletion(fanout,'fanout: ');
    if (failure) return {...failure,stage:'native-fanout'};
    const output=fanout.getOutput();
    if (!output.validation.valid) return {solved:false,stage:'native-fanout',reason:'Native fanout validation failed',validation:output.validation};
    const downstream=fanout.getOutputSimpleRouteJson();
    // The original board copper is already immutable obstacles. Only the new
    // fanout copper is preloaded for the downstream native routing stage.
    downstream.obstacles=downstream.obstacles.map(({componentId,...o})=>o);
    solver=new SOLVERS.AutoroutingPipelineSolver(downstream,{cacheProvider:null,effort});
  } else if (solverVersion === 'fanout') {
    const origin=job.terminals[0], componentId='control_source';
    input.obstacles=input.obstacles.map(o=>Math.hypot(o.center.x-origin.x,o.center.y-origin.y)<1e-6 && o.connectedTo.includes(job.name)
      ? {...o,componentId} : o);
    const pads=input.obstacles.filter(o=>o.componentId===componentId);
    const target=job.terminals.at(-1),dx=target.x-origin.x,dy=target.y-origin.y;
    const direction=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'up':'down');
    solver=new SOLVERS.FanoutSolver(input,{sourceComponentId:componentId,defaultDirection:direction,
      sharedBoundary:{minX:Math.min(...pads.map(p=>p.center.x-p.width/2))-.8,
        maxX:Math.max(...pads.map(p=>p.center.x+p.width/2))+.8,
        minY:Math.min(...pads.map(p=>p.center.y-p.height/2))-.8,
        maxY:Math.max(...pads.map(p=>p.center.y+p.height/2))+.8},
      singleLayerAdaptiveExits:true,availableCornersAndSides:['top','right','bottom','left'],
      traceWidth:job.rule.widthMm,clearance:job.rule.clearanceMm,
      viaDiameter:input.minViaPadDiameter,viaHoleDiameter:input.minViaHoleDiameter,
      escapeLayers:['top','bottom'],allowBlindAndBuriedVias:false,allowSameNetMerges:true,
      completeOriginalEndpoints:true,endpointCompletionEffort:effort});
  } else {
    const Solver = ({3:SOLVERS.AutoroutingPipelineSolver3_HgPortPointPathing,
      4:SOLVERS.AutoroutingPipelineSolver4,7:SOLVERS.AutoroutingPipelineSolver7_MultiGraph})[solverVersion]
      ?? SOLVERS.AutoroutingPipelineSolver;
    solver = new Solver(input, {cacheProvider: null, effort});
  }
  const failure=await stepToCompletion(solver,'');
  if (failure) return {...failure,stage:'native-multilayer'};
  let generated;
  if (solverVersion === 'boundary') {
    const output=solver.getOutput();
    if(!output.validation.valid)return {solved:false,reason:'Native boundary route validation failed',validation:output.validation};
    generated=output.fanoutTraces;
  } else if (solverVersion === 'fanout') {
    const output=solver.getOutput();
    if (!output.endpointCompletion?.connectivity.valid || !output.endpointCompletion?.drc.valid)
      return {solved:false,reason:'Native fanout endpoint completion failed',completion:output.endpointCompletion};
    generated=[...output.fanoutTraces,...output.completionTraces];
  } else if (solverVersion === 'fanout-pipeline') generated=solver.getOutputSimpleRouteJson().traces ?? [];
  else generated=solver.getOutputSimplifiedPcbTraces();
  const traces = generated.map(t => ({...t, route: t.route.map(p => p.route_type === 'via'
    ? {...p, layers: ['top', 'inner1', 'inner2', 'inner3', 'inner4', 'bottom']} : p)}));
  for(const contact of job.plannedTerminalVias ?? []) {
    const p=job.terminals.find(t=>t.selector===contact.selector);
    const via={route_type:'via',x:p.x,y:p.y,via_diameter:contact.diameterMm,via_hole_diameter:contact.holeMm,
      layers:['top','inner1','inner2','inner3','inner4','bottom']};
    const matches=q=>q?.route_type==='wire'&&q.layer==='bottom'&&Math.hypot(q.x-p.x,q.y-p.y)<1e-6;
    for(const trace of traces){
      if(matches(trace.route[0]))trace.route.unshift({...trace.route[0],layer:'top'},
        {...via,from_layer:'top',to_layer:'bottom'});
      if(matches(trace.route.at(-1)))trace.route.push({...via,from_layer:'bottom',to_layer:'top'},
        {...trace.route.at(-1),layer:'top'});
    }
  }
  for(const launch of launches){
    const end=launch.route.at(-1);
    const matches=p=>p?.route_type==='wire'&&p.layer===end.layer&&Math.hypot(p.x-end.x,p.y-end.y)<1e-6;
    const reverse=()=>[...launch.route].reverse().map(p=>p.route_type==='via'?{...p,from_layer:p.to_layer,to_layer:p.from_layer}:p);
    for(const t of traces){
      if(matches(t.route[0]))t.route.unshift(...launch.route.slice(0,-1));
      if(matches(t.route.at(-1)))t.route.push(...reverse().slice(1));
    }
  }
  if (!traces.length || traces.some(t => t.route.some(p => p.route_type === 'wire'
    && (!['top', 'bottom'].includes(p.layer) || p.width < job.rule.widthMm - 1e-8))))
    throw Error('Native output violated the allowed signal layers or trace width');
  return {solved: true, stage: 'native-multilayer', traces, viaCount: traces.flatMap(t => t.route).filter(p => p.route_type === 'via').length,
    elapsedMs: performance.now() - start, nativeObstacleMarginMm: job.rule.clearanceMm, finalAcceptancePending: true};
}
