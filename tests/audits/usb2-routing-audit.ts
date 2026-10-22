import type {AnyCircuitElement} from "tscircuit";
import {usb2Rules as rules} from "../../lib/usb2-routing";

// USB-C presents the same USB2 bus on two contact rows. Measure both paths,
// rather than allowing an unrouted second row or hidden branch mismatch.
export function auditUsb2Routing(json:AnyCircuitElement[]){
  const failures:string[]=[];
  const sc=json.filter(e=>e.type==="source_component"),sp=json.filter(e=>e.type==="source_port");
  const pp=json.filter(e=>e.type==="pcb_port"),sources=json.filter(e=>e.type==="source_trace");
  const traces=json.filter(e=>e.type==="pcb_trace");
  const port=(component:string,pin:string)=>{
    const c=sc.find(c=>c.name===component),s=sp.find(p=>p.source_component_id===c?.source_component_id&&p.port_hints?.includes(pin));
    const p=pp.find(p=>p.source_port_id===s?.source_port_id);if(!p)throw Error(`Missing USB2 ${component}.${pin}`);return p;
  };
  const conductors=(["P","N"] as const).map(pol=>{
    let vias=0;const lengths:Record<string,number>={};
    for(const stage of ["TRUNK","RECEPTACLE"]){
      const name=`USB2_${pol}_${stage}`,s=sources.find(s=>s.name===name),copper=traces.filter(t=>t.source_trace_id===s?.source_trace_id);
      if(copper.length!==1)failures.push(`${name}: expected one physical route, found ${copper.length}`);
      const ends=stage==="TRUNK"?[port("ASM2464PDX",pol==="P"?"UDP":"UDM"),port("USBC",pol==="P"?"A6":"A7")]
        :[port("USBC",pol==="P"?"A6":"A7"),port("USBC",pol==="P"?"B6":"B7")];
      let length=0;
      for(const trace of copper){
        if(!ends.every(p=>[trace.route[0],trace.route[trace.route.length-1]].some(q=>q.route_type!=="through_pad"&&Math.hypot(q.x-p.x,q.y-p.y)<1e-5)))
          failures.push(`${name}: wrong physical endpoint`);
        for(const [i,p] of trace.route.entries()){
          if(p.route_type==="via"){vias++;continue}
          if(p.route_type!=="wire"){failures.push(`${name}: unexpected route point`);continue}
          if(!["top","bottom"].includes(p.layer)||Math.abs(p.width-rules.width)>1e-6)failures.push(`${name}: invalid layer/width`);
          const q=trace.route[i+1];if(q?.route_type==="wire"&&q.layer===p.layer)length+=Math.hypot(q.x-p.x,q.y-p.y);
        }
      }
      lengths[stage]=length;
    }
    if(vias>rules.maxVias)failures.push(`USB2 ${pol}: more than four signal vias`);
    if(lengths.TRUNK+lengths.RECEPTACLE>=rules.maxLength)failures.push(`USB2 ${pol}: exceeds four inch length limit`);
    return{polarity:pol,nearRowLengthMm:lengths.TRUNK,farRowLengthMm:lengths.TRUNK+lengths.RECEPTACLE,viaCount:vias};
  });
  const nearRowSkewMm=Math.abs(conductors[0].nearRowLengthMm-conductors[1].nearRowLengthMm);
  const farRowSkewMm=Math.abs(conductors[0].farRowLengthMm-conductors[1].farRowLengthMm);
  if(Math.max(nearRowSkewMm,farRowSkewMm)>rules.maxSkew)failures.push("USB2: P/N skew exceeds the 0.5 mm project target (ASMedia <20 mil)");
  if(conductors[0].viaCount!==conductors[1].viaCount)failures.push("USB2: unequal P/N signal via counts");
  return{passed:!failures.length,failures,conductors,nearRowSkewMm,farRowSkewMm,
    note:"Copper lengths exclude via depth and package delay. Connector row ties are local launches for final SI review."};
}
