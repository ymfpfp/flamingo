// Read actual series/parallel components and verify their terminals. Models
// must not mistake one member of a network for its equivalent resistance.
export function buckFeedbackNetwork(g, rail) {
  const top = g.component(`R_${rail}_FBT`), bottom = g.component(`R_${rail}_FBB`);
  const extra = g.components.find(c => c.name === `R_${rail}_FBT_B`);
  const feedback = g.net(`${rail}_BUCK`, 'FB');
  if (extra && (g.net(top.name,'pin2') !== g.net(extra.name,'pin1')
    || g.net(top.name,'pin2') === feedback
    || g.net(extra.name,'pin2') !== feedback)) throw Error('Invalid series feedback network: '+rail);
  if (g.net(top.name,'pin1') !== g.net(`L_${rail}`,'pin2')
    || g.net(extra?.name ?? top.name,'pin2') !== feedback
    || g.net(bottom.name,'pin1') !== feedback
    || g.net(bottom.name,'pin2') !== g.net('ATX','pin3')) throw Error('Invalid feedback divider: '+rail);
  const topParts = extra ? [top,extra] : [top];
  return {topParts, bottom, topOhm:topParts.reduce((sum,c)=>sum+c.resistance,0), bottomOhm:bottom.resistance};
}

export function slotGateNetwork(g, rail) {
  const on = g.component(`R_SLOT_GATE_${rail}`), off = g.component(`R_SLOT_OFF_${rail}`);
  const cap = g.component(`C_SLOT_GATE_${rail}`);
  const onB = g.components.find(c=>c.name===`R_SLOT_GATE_${rail}_B`);
  const offB = g.components.find(c=>c.name===`R_SLOT_OFF_${rail}_B`);
  const capB = g.components.find(c=>c.name===`C_SLOT_GATE_${rail}_B`);
  const gate = g.net(`Q_SLOT_${rail}`,'pin4'), source = g.net(`Q_SLOT_${rail}`,'pin1');
  const drain = g.net(`Q_SLOT_DRV_${rail}`,'D');
  if (g.net(on.name,'pin1')!==drain || g.net(on.name,'pin2')!==gate
    || g.net(off.name,'pin1')!==source || g.net(cap.name,'pin1')!==source
    || g.net(cap.name,'pin2')!==gate) throw Error('Invalid slot gate network: '+rail);
  if (onB && (g.net(onB.name,'pin1')!==drain || g.net(onB.name,'pin2')!==gate)) throw Error('Invalid parallel gate resistor');
  if (offB && (g.net(off.name,'pin2')!==g.net(offB.name,'pin1')
    || g.net(off.name,'pin2')===gate || g.net(offB.name,'pin2')!==gate)) throw Error('Invalid series gate-off resistors');
  if (!offB && g.net(off.name,'pin2')!==gate) throw Error('Invalid gate-off resistor');
  if (capB && (g.net(capB.name,'pin1')!==source || g.net(capB.name,'pin2')!==gate)) throw Error('Invalid parallel gate capacitor');
  const turnOnParts=onB?[on,onB]:[on], turnOffParts=offB?[off,offB]:[off], capacitors=capB?[cap,capB]:[cap];
  return {turnOnParts,turnOffParts,capacitors,
    turnOnResistanceOhm:1/turnOnParts.reduce((sum,c)=>sum+1/c.resistance,0),
    turnOffResistanceOhm:turnOffParts.reduce((sum,c)=>sum+c.resistance,0),
    gateCapacitanceF:capacitors.reduce((sum,c)=>sum+c.capacitance,0)};
}
