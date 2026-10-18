import defaultProcess from "../manufacturing/bridge-bga/process.json" with {type:"json"};

// Measurements only: this module does not create traces or implement a router.
const near = (a,b) => Math.abs(a-b)<1e-7;
function capsule(p, expansion=0) {
  const w=p.shape==="circle"?2*p.radius:p.width, h=p.shape==="circle"?2*p.radius:p.height;
  if(!["circle","pill"].includes(p.shape)) throw Error(`Unsupported review shape ${p.shape}`);
  const d=Math.abs(w-h)/2, r=Math.min(w,h)/2+expansion;
  return {a:{x:p.x-(w>h?d:0),y:p.y-(h>w?d:0)},b:{x:p.x+(w>h?d:0),y:p.y+(h>w?d:0)},r};
}
function pointSegment(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;
  const t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/n)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function distance(a,b) {
  // All capsule axes in the isolated review footprint are horizontal or vertical.
  const intersects=Math.max(Math.min(a.a.x,a.b.x),Math.min(b.a.x,b.b.x))<=Math.min(Math.max(a.a.x,a.b.x),Math.max(b.a.x,b.b.x))
    && Math.max(Math.min(a.a.y,a.b.y),Math.min(b.a.y,b.b.y))<=Math.min(Math.max(a.a.y,a.b.y),Math.max(b.a.y,b.b.y));
  const centerDistance=intersects?0:Math.min(pointSegment(a.a,b.a,b.b),pointSegment(a.b,b.a,b.b),pointSegment(b.a,a.a,a.b),pointSegment(b.b,a.a,a.b));
  return centerDistance-a.r-b.r;
}
export function reviewBridgeBga(json, physicalBallMap, process=defaultProcess) {
  const component=json.find(e=>e.type==="source_component"&&e.name==="ASM2464PDX");
  const pcb=json.find(e=>e.type==="pcb_component"&&e.source_component_id===component?.source_component_id);
  if(!pcb||!near(pcb.rotation,0))throw Error("Use the isolated, unrotated footprint-review fixture.");
  const pads=json.filter(e=>e.type==="pcb_smtpad"&&e.pcb_component_id===pcb.pcb_component_id);
  const pastes=json.filter(e=>e.type==="pcb_solder_paste"&&e.pcb_component_id===pcb.pcb_component_id);
  const failures=[];const require=(ok,msg)=>{if(!ok)failures.push(msg);};
  const circular=pads.filter(p=>p.shape==="circle"),oblong=pads.filter(p=>p.shape==="pill");
  require(pads.length===273&&circular.length===196&&oblong.length===77,"Incorrect bridge pad counts");
  require(pastes.length===273,"Every bridge pad needs one explicit paste aperture");
  let minimumCopper=Infinity,minimumMaskWeb=Infinity,closestCopper,closestMask;
  for(let i=0;i<pads.length;i++)for(let k=i+1;k<pads.length;k++) {
    const a=pads[i],b=pads[k],c=distance(capsule(a),capsule(b));
    const m=distance(capsule(a,a.soldermask_margin??0),capsule(b,b.soldermask_margin??0));
    if(c<minimumCopper){minimumCopper=c;closestCopper=[a.port_hints[1],b.port_hints[1]];}
    if(m<minimumMaskWeb){minimumMaskWeb=m;closestMask=[a.port_hints[1],b.port_hints[1]];}
  }
  const byBall=Object.fromEntries(pads.map(p=>[p.port_hints[1],p]));
  const inner=pads.filter(p=>Math.abs(p.x-pcb.center.x)<=3.250001&&Math.abs(p.y-pcb.center.y)<=3.250001);
  require(inner.length===121,"Incorrect coarse-array ball count");
  require(inner.every(p=>process.escape.innerArrayNets.includes(physicalBallMap[p.port_hints[1]])),"A signal ball is present in the proposed power-only coarse-array escape");
  let minimumAreaRatio=Infinity;
  for(const pad of pads) {
    const round=pad.shape==="circle";
    if(round) require(pad.radius*2>=0.2-1e-7,`Land below JLCPCB ENIG minimum: ${pad.port_hints[1]}`);
    require(round?near(pad.radius*2,process.footprint.circularLandDiameterMm):near(Math.min(pad.width,pad.height),0.1778)&&near(Math.max(pad.width,pad.height),0.3302),`Unexpected land: ${pad.port_hints[1]}`);
    require(near(pad.soldermask_margin,round?process.footprint.circularSolderMaskMarginMm:process.footprint.oblongSolderMaskMarginMm),`Unexpected mask margin: ${pad.port_hints[1]}`);
    const paste=pastes.find(p=>p.pcb_smtpad_id===pad.pcb_smtpad_id);
    if(!paste){require(false,`Missing paste for ${pad.port_hints[1]}`);continue;}
    require(paste.shape===pad.shape&&near(paste.x,pad.x)&&near(paste.y,pad.y)&&(round?near(paste.radius,pad.radius):near(paste.width,pad.width)&&near(paste.height,pad.height)),`Paste aperture changed from 1:1 copper: ${pad.port_hints[1]}`);
    const w=round?paste.radius*2:Math.min(paste.width,paste.height),l=round?w:Math.max(paste.width,paste.height);
    const area=Math.PI*w*w/4+w*(l-w),perimeter=Math.PI*w+2*(l-w);
    minimumAreaRatio=Math.min(minimumAreaRatio,area/(perimeter*process.assembly.bridgeStencilThicknessMm));
  }
  const width=process.escape.outerEscapeTraceWidthMm;
  const outerPadClearance=(process.footprint.outerPitchMm-process.footprint.oblongWidthMm-width)/2;
  const outerMaskClearance=outerPadClearance-process.footprint.oblongSolderMaskMarginMm;
  const diagonal=Math.SQRT2*process.escape.innerDogboneOffsetMm;
  const dogboneCopper=diagonal-process.footprint.circularLandDiameterMm/2-process.escape.viaCopperDiameterMm/2;
  const dogboneDrill=diagonal-process.footprint.circularLandDiameterMm/2-process.escape.viaDrillMm/2;
  require(minimumCopper>=0.15-1e-7,"BGA copper spacing is below 0.15 mm");
  require(minimumMaskWeb>=process.escape.minimumMaskWebMm-1e-7,"BGA mask web is too small");
  require(outerPadClearance>=0.1-1e-7&&outerMaskClearance>=0.09-1e-7,"Proposed outer-row escape corridor violates copper/mask clearance");
  require(dogboneCopper>=0.125-1e-7&&dogboneDrill>=0.2-1e-7,"Proposed coarse-array dogbone does not fit");
  require(minimumAreaRatio>=process.assembly.minimumApertureAreaRatio,"Proposed stencil is too thick for its apertures");
  const aa1=byBall.AA1;require(aa1?.shape==="pill"&&aa1.width>aa1.height,"AA1 orientation changed");
  return {revision:process.revision,engineeringGeometryPass:!failures.length,failures,
    vendorAcceptanceReceived:process.vendorAcceptance.received,productionRelease:false,
    counts:{total:pads.length,circular:circular.length,oblong:oblong.length,paste: pastes.length,coarsePowerAndGround:inner.length},
    measurementsMm:{minimumCopper,closestCopper,minimumMaskWeb,closestMask,outerEscapePadClearance:outerPadClearance,outerEscapeMaskClearance:outerMaskClearance,
      coarseDogbonePadToViaCopper:dogboneCopper,coarseDogbonePadToDrill:dogboneDrill},
    minimumApertureAreaRatio:minimumAreaRatio,
    limits:["Nominal geometry only; mask registration and stencil transfer require assembler acceptance.","The 0.20 mm circular land is a project candidate, not an ASMedia-specified land diameter.","The local dogbone calculation is a single-cell feasibility check, not a completed escape or plane-continuity proof.","Global 0.10 mm routing rules remain active. Local 3 mil escapes require explicit region checks during layout."]};
}
