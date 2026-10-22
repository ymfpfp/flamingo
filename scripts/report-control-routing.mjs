import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {controlNets} from '../lib/control-routing-config.mjs';
const out='dist/control-routing/controls17/';
const input=process.argv[2]??out+'spi3-validated.circuit.json';
const read=f=>JSON.parse(readFileSync(f));
const sha=createHash('sha256').update(readFileSync(input)).digest('hex');
const physical=read(out+'final-emitted-physical.json'),preserved=read(out+'final-preservation.json');
const native=read(out+'final-native-connectivity.json'),validation=read('dist/validation/board.json');
const impedance=read(out+'final-impedance.json');
const slotPower=read(out+'final-slot-power-dc.json');
const slotPowerComparison=read(out+'final-slot-power-comparison.json');
const requiredChecks=['pcie-tx/check_asmedia_spacing.py','pcie-tx/check_reference_planes.py',
 'usb4/check_layout.py','usb4/check_reference_planes.py','bridge-clocks/check_layout.py','buck/check_layout.py',
 'power-distribution/check_layout.py','power-distribution/check_vcch.py','power-distribution/check_atx5v.py',
 'power-distribution/check_atx5v_dc.py','power-distribution/check_slot.py','power-distribution/check_slot_dc.py',
 'power-distribution/check_vbus.py','power-distribution/check_ground_returns.py','schematic-placement','shorts','pcb-style'];
if(!physical.passed||physical.sourceSha256!==sha||!preserved.passed||preserved.sourceSha256!==sha
 ||!validation.passed||validation.sourceSha256!==sha||native.sourceSha256!==sha
 ||!impedance.passed||impedance.sourceSha256!==sha
 ||slotPower.sourceSha256!==sha||slotPowerComparison.native3.sourceSha256!==sha
 ||!Array.isArray(native.unexpectedConnectivity)||native.unexpectedConnectivity.length
 ||['netlist','placement','schematic'].some(k=>native[k].length)
 ||requiredChecks.some(k=>validation.reports[k]?.passed!==true))throw Error('Current integration checks are incomplete');
const applied=physical.nets.map(n=>n.net),deferred=[];
const remaining=controlNets.map(n=>n.name).filter(n=>!applied.includes(n));
const latestRequest=['ASM_CC1','ASM_CC2'];
const latestComplete=latestRequest.filter(n=>applied.includes(n));
const newlyApplied=latestComplete;
const powerLoad=validation.reports.pdnLoad;
const loadScreen={qualified:powerLoad?.qualified??false,results:(powerLoad?.report?.results??[]).map(r=>({rail:r.rail,
 currentA:r.currentA,copperTemperatureC:r.copperTemperatureC,maximumDropMV:r.fine.maximumDropMV,
 screeningUpperDropMV:r.screeningUpperDropMV}))};
const status={complete:remaining.length===0,requestedPassComplete:latestComplete.length===latestRequest.length,
 requestedNets:latestRequest.length,completedThisPass:newlyApplied.length,newlyAppliedNets:newlyApplied,appliedNets:applied,
 remainingNets:remaining,deferredNets:deferred,sourceSha256:sha,board:input,
 localReworkAuthorized:true,clearancePolicy:'Configured ASMedia/project widths and trace spacing; user-approved fabrication clearances only in bounded CC fixed-pad launch regions',componentLayer:'top',
 localPowerReworkApproval:'Approved by the user; local power stitching and flash-feed vias were relocated and their planes revalidated',
 localControlReworkApproval:'User-authorized local control rerouting and exact recorded top-side component moves; strict clearances and fixed PCIe/USB signal copper',
 authorizedComponentMoves:preserved.authorizedComponentMoves??[],
 powerLoadQualification:loadScreen,
 slotPowerLoadScreen:slotPower,slotPowerRoutingChange:slotPowerComparison,
 latestRequestedNets:latestRequest,latestCompletedNets:latestComplete,
 report:out+'report.html'};
writeFileSync('manufacturing/control-routing/status.json',JSON.stringify(status,null,2)+'\n');
const summary={...status,physical,impedance,preservation:preserved,checks:{netlist:true,placement:true,schematic:true,shorts:true,pcbStyle:true,
 priorRouteAudits:true,physicalCopperAndDrills:true,freshPourRefill:true,pcieReference:true,usbReference:true,pdnContinuity:true},
 unresolvedPortFindings:native.ports.length,missingSourceTraceFindings:native.missing.length,
 scope:'Layout validation with the supplied ASMedia rules and fabrication clearances. Channel SI and load qualification remain separate deferred work.'};
writeFileSync(out+'completion.json',JSON.stringify(summary,null,2)+'\n');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const rows=controlNets.map(n=>{const m=physical.nets.find(m=>m.net===n.name);return `<tr><td>${esc(n.name)}</td><td>${m?'Routed and checked':deferred.includes(n.name)?'Deferred by user':'Unresolved'}</td><td>${m?`${m.totalTreeCopperLengthMm.toFixed(3)} mm; ${m.viaCount} vias; minimum full-rule gap ${(m.minimumStrictForeignCopperGapMm??m.minimumForeignCopperGapMm).toFixed(4)} mm / target ${m.requiredGapMm.toFixed(4)} mm${m.fixedPadLaunchPolicy ? `; approved pad-launch gap ${m.minimumApprovedLaunchPadGapMm?.toFixed(4)??"n/a"} mm` : ""}`:'No unqualified or partial route applied'}</td></tr>`}).join('');
mkdirSync(out+'checks',{recursive:true});copyFileSync('checks/check-pcb-style/pcb.svg',out+'checks/pcb.svg');
writeFileSync(out+'report.html',`<!doctype html><html lang="en"><meta charset="utf-8"><title>Control routing validation</title><style>body{font:16px system-ui;max-width:1200px;margin:32px auto;padding:0 24px;color:#162332;line-height:1.5}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #cbd3dd;padding:8px;text-align:left}th{background:#edf1f5}.status{background:${remaining.length?'#fff0cf':'#e2f2e8'};padding:16px}</style><h1>Control routing validation</h1><p class="status"><strong>${latestComplete.length}/${latestRequest.length} nets finished from the latest request; ${remaining.length} remain. ${remaining.length ? "Routing is incomplete." : "All requested control/support signals are routed."}</strong></p><p>Finished from the latest request: ${latestComplete.map(esc).join(', ')}. ${applied.length}/22 control/support nets are routed and independently checked on this source build.</p><p>All ${preserved.assembledCount} assembled components remain on top. ${(preserved.authorizedComponentMoves??[]).length} exact recorded component moves pass the placement comparison. PCIe/USB signal copper is preserved exactly. User-authorized local ground, clock, power-via, component and control routing changes are recorded in the preservation comparison. Refreshed copper pours and all power connectivity checks pass.</p><p>The saved control nets’ actual emitted copper passes the configured widths and trace spacing, approved CC pad-launch fabrication clearances, complete terminal connectivity, full-stack via/drill checks, board and hole clearances, length ceilings and ground-reference checks. Source netlist, PCB and schematic placement, shorts, style, prior-route audits and refreshed power-plane continuity pass. Controls with a configured 50 ohm target pass the nominal ±15% uniform-line screen; CC1/CC2 retain their specified 8 mil width and 15 mil trace spacing. Crystal coupled sections retain the nominal 85 ohm geometry. Final channel SI remains deferred.</p><p>SBU routing uses the conservative project target of 5 mil width and 10 mil spacing; the supplied ASMedia guide has no separate SBU routing table. SPI includes the existing programming-header and pull-up branches. These layout checks do not qualify those branches against the guide’s point-to-point channel topology.</p><p>Power-load qualification ${loadScreen.qualified ? "passes the configured screen" : "remains open"}. The existing 3 A / 80 °C screen gives ${loadScreen.results.map(r=>`${esc(r.rail)}: ${r.maximumDropMV.toFixed(2)} mV nominal conductor drop, ${r.screeningUpperDropMV.toFixed(2)} mV including mesh allowance`).join("; ")}, against the 8 mV project target. This layout pass does not grant power-load or channel-SI sign-off.</p><p>The local CC1 power detour increases the estimated SLOT_12V conductor drop at ${slotPowerComparison.native3.currentA} A / ${slotPower.copperTemperatureC} °C from ${slotPowerComparison.baseline.dropMV.toFixed(2)} to ${slotPowerComparison.native3.dropMV.toFixed(2)} mV: +${slotPowerComparison.deltaMV.toFixed(2)} mV (+${slotPowerComparison.deltaPercent.toFixed(1)}%). The current output-only screen includes ${slotPower.results.find(r=>r.rail==="SLOT_12V").withMeshAllowanceMV.toFixed(2)} mV with mesh allowance. This is a routing tradeoff, and the 12 V load, thermal and AC behavior still require qualification. <a href="final-slot-power-comparison.json">Before/after conductor screen</a> · <a href="final-slot-power-dc.json">Current slot power screen and limitations</a>.</p><p>Three 2.2 µF VCCL bulk bypass capacitors moved with their via-in-pad contacts to make the CC1 escape and power detour fit. The smaller VDD/VCCH bypass capacitors and PCIe/USB signal copper retain their existing placement and routes. AC power response remains part of the deferred qualification.</p><figure><img src="checks/cc-local-rework.png" alt="Native L4 slot-power copper and its continuous 15 mil core around the CC1 launch and capacitor row" style="width:100%;height:auto"><figcaption>Native L4 slot-power copper and continuous 15 mil core around the CC1 launch.</figcaption></figure><h2>Remaining work</h2><p>${remaining.length ? `Unresolved: ${remaining.map(esc).join(', ')}. These signals still require complete routes and validation.` : 'All signals in the requested pass are routed and checked.'} Only the user-approved, bounded CC pad-launch fabrication clearances are enabled; full trace-to-trace spacing remains enforced.</p><table><thead><tr><th>Net</th><th>Status</th><th>Measured emitted copper</th></tr></thead><tbody>${rows}</tbody></table><p><a href="completion.json">Completion record</a> · <a href="final-emitted-physical.json">Physical measurements</a> · <a href="final-preservation.json">Preservation comparison</a> · <a href="final-impedance.json">Nominal control impedance</a> · <a href="final-native-connectivity.json">Remaining connectivity findings</a> · <a href="checks/pcb.svg">Board overview</a></p><p>Build SHA-256: <code>${sha}</code>. Clearance calculations use a 0.00001 mm numerical tolerance. Approved CC launch masks are bounded to 1 mm from their terminals. Trace-to-trace, high-speed isolation, width and drill requirements are unchanged.</p></html>`);
// Existing report bookmarks must no longer show the earlier three-net status.
writeFileSync('dist/control-routing/controls21/report.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../controls17/report.html"><a href="../controls17/report.html">Current control-routing report</a></html>');
console.log(`${latestComplete.length}/2 CC nets finished; ${remaining.length} control/support nets unresolved.`);
