import {buildMultilayerControlInput, solveControlNet} from './control-routing.mjs';

// Implements tscircuit's algorithmFn event contract, delegating all geometric
// search to its installed native Pipeline 9. The prepared jobs add conservative
// polygon-pour/isolation covers that the native SRJ converter does not supply.
// The source phase must first resolve the same real pad endpoints as that job.
export function nativeControlRouting({jobs, captureOnly = false, timeoutMs = 10000, onInput, accept}) {
  const byName = new Map(jobs.map(job => [job.name, job]));
  const preceding = [];
  let blocked;
  const router = run => {
    const listeners = new Map();
    const emit = (name, event) => {for (const cb of listeners.get(name) ?? []) cb(event);};
    return {
      on(name, cb) {listeners.set(name, [...listeners.get(name) ?? [], cb]); return this;},
      start() {Promise.resolve().then(run).then(traces => emit('complete', {traces}), error => emit('error', {error}));},
      stop() {},
    };
  };
  return {
    algorithmForNet: name => async phaseInput => router(async () => {
      const job = byName.get(name);
      if (!job) throw Error(`No routing policy for ${name}`);
      const points = phaseInput.connections.flatMap(c => c.pointsToConnect);
      const missing = job.terminals.filter(t => !points.some(p =>
        Math.hypot(p.x - t.x, p.y - t.y) < 1e-5));
      if (missing.length) throw Error(`${name}: source phase omitted pads: ${missing.map(t => t.selector).join(', ')}`);
      if (phaseInput.minTraceWidth < job.rule.widthMm - 1e-9 ||
          phaseInput.minTraceToPadEdgeClearance < job.rule.clearanceMm - 1e-9)
        throw Error(`${name}: native phase lost its width/clearance rules`);
      const solverInput = buildMultilayerControlInput(job, preceding);
      await onInput?.({name, phaseInput, solverInput, acceptance: job.rule});
      if (captureOnly) return []; // Diagnostic output is never a routed board.
      if (blocked) throw Error(`Routing stopped after ${blocked}`);
      try {
        const result = await solveControlNet(job, preceding, {timeoutMs});
        if (!result.solved) throw Error(result.reason);
        // Native success alone never authorizes inserting copper into a phase.
        if (!accept) throw Error('Physical acceptance callback is required');
        await accept(job, result);
        for (const trace of result.traces) preceding.push({net: name, clearanceMm: job.rule.clearanceMm, trace});
        return result.traces.map((trace, index) => ({...trace,
          pcb_trace_id: `control_${name}_${index}`, connection_name: phaseInput.connections[0].name,
          source_trace_id: job.branches[0].sourceTraceId,
          connectsTo: job.terminals.map(t => t.pcb_port_id)}));
      } catch (error) {blocked = `${name}: ${error.message}`; throw Error(blocked);}
    }),
    remainingAlgorithm: async input => router(async () => {
      await onInput?.({name: 'UNASSIGNED', phaseInput: input});
      if (captureOnly) return [];
      // routeRemaining=true is enabled in this pass, but an unknown net must
      // receive a rule before the generic default can route it.
      if (input.connections.length) throw Error('Unassigned connections need an explicit routing policy');
      return [];
    }),
  };
}
