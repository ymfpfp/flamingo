import {circuitGraph} from './circuit-graph.mjs';
// Separate from the direct ceramic bank. No assumed capacitor ESR is credited
// to TI's damping requirement; the two real resistors provide the minimum.
export function vddReserveSpec(board) {
 const g=circuitGraph(board), names=g.components.map(c=>c.name);
 if(!names.some(n=>n.startsWith('C_VDD_RESERVE_')))return [];
 const branches=['A','B'].map(s=>{
  const capacitor=g.component(`C_VDD_RESERVE_${s}`), resistor=g.component(`R_VDD_DAMP_${s}`);
  if(capacitor.manufacturer_part_number!=='T520B337M2R5ATE009'||Math.abs(capacitor.capacitance-330e-6)>1e-12||capacitor.max_voltage_rating!==2.5
    ||!['WSL0805R0220FEA','PE1206FRM070R022L'].includes(resistor.manufacturer_part_number)||resistor.resistance!==.022
    ||g.net(resistor.name,'pin1')!==g.net('L_VDD','pin2')||g.net(resistor.name,'pin2')!==g.net(capacitor.name,'pin1')
    ||g.net(capacitor.name,'pin2')!==g.net('ATX','pin3')||g.net(resistor.name,'pin1')===g.net(resistor.name,'pin2'))
    throw Error(`Invalid VDD reserve branch ${s}`);
  return {capacitor:capacitor.name,resistor:resistor.name,capacitanceF:capacitor.capacitance,
   capacitanceToleranceFraction:.2,seriesResistanceOhm:resistor.resistance,resistorToleranceFraction:.01,resistorTcrPpmK:75,
   capacitorEsrOhm:.009,capacitorEsrSpecification:'Maximum at 25 C, 300–500 kHz; no guaranteed minimum',
   contactResistanceSensitivityOhm:s==='A'?.006:.009,branchInductanceSensitivityNH:5,
   modelLimit:'6/9 mOhm contact allowances and 5 nH branch inductance are assumptions, not extracted loop parasitics. Additional C/ESR/ESL sensitivity cases are required.'};
 });
 const minR=1/branches.reduce((g,b)=>g+1/(b.seriesResistanceOhm*(1-b.resistorToleranceFraction)*(1-b.resistorTcrPpmK*1e-6*125)),0);
 if(minR<.01)throw Error('Insufficient explicit VDD reserve damping');
 const ss=g.component('C_VDD_SS');
 if(ss.manufacturer_part_number!=='CL05B473KO5NNNC'||Math.abs(ss.capacitance-47e-9)>1e-18
   ||g.net(ss.name,'pin1')!==g.net('VDD_BUCK','SS')||g.net(ss.name,'pin2')!==g.net('ATX','pin3'))throw Error('Invalid VDD soft start');
 return branches;
}
