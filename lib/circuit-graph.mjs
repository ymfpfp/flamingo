/** Electrical connectivity only: capacitors and MOSFET channels never join nets. */
export function circuitGraph(json, {zeroOhm = false} = {}) {
  const components = json.filter(e => e.type === "source_component");
  const ports = json.filter(e => e.type === "source_port");
  const parents = new Map();
  function root(id) {
    if (!parents.has(id)) parents.set(id, id);
    if (parents.get(id) !== id) parents.set(id, root(parents.get(id)));
    return parents.get(id);
  }
  function join(ids) { for (const id of ids.slice(1)) parents.set(root(id), root(ids[0])); }
  for (const trace of json.filter(e => e.type === "source_trace")) {
    join([...trace.connected_source_port_ids, ...trace.connected_source_net_ids]);
  }
  for (const c of components) {
    for (const group of c.internally_connected_source_port_ids ?? []) join(group);
    if (zeroOhm && c.ftype === "simple_resistor" && c.resistance === 0) {
      join(ports.filter(p => p.source_component_id === c.source_component_id).map(p => p.source_port_id));
    }
  }
  function component(name) {
    const matches = components.filter(c => c.name === name);
    if (matches.length !== 1) throw new Error(`Expected one component ${name}, received ${matches.length}`);
    return matches[0];
  }
  function port(name, alias) {
    const id = component(name).source_component_id;
    const matches = ports.filter(p => p.source_component_id === id && p.port_hints.includes(alias));
    if (matches.length !== 1) throw new Error(`Expected one port ${name}.${alias}, received ${matches.length}`);
    return matches[0];
  }
  const net = (name, alias) => root(port(name, alias).source_port_id);
  const byNet = new Map();
  for (const p of ports) {
    const id = root(p.source_port_id);
    if (!byNet.has(id)) byNet.set(id, []);
    byNet.get(id).push(p);
  }
  return {components, ports, root, component, port, net, byNet};
}
