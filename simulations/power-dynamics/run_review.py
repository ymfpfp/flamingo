"""Conditional ripple and first-response screens. This is not a TPS62903 model.

Run with NumPy, SciPy and Matplotlib. Inputs bind to the reviewed circuit SHA.
The complete assumptions and numeric checks are saved beside the plots.
"""
import hashlib
import argparse
import itertools
import json
from functools import lru_cache
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.linalg import expm

ROOT = Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--review',default='dist/first-try-review/results.json')
parser.add_argument('--out',default='dist/power-dynamics')
parser.add_argument('--loads',help='Optional explicit provisional load JSON; default retains the historical PD-current proxy')
args=parser.parse_args()
loads_path = ROOT / args.loads if args.loads else None
loads = json.loads(loads_path.read_text()) if loads_path else None
current_label = loads['label'] if loads else 'PD maximum proxy'
if loads:
    for rail in ['VCCL', 'VDD']:
        current = loads['rails'][rail]['designCurrentA']
        if not isinstance(current, (int, float)) or not np.isfinite(current) or current <= 0:
            raise ValueError('Invalid selected current for '+rail)
review_path=ROOT/args.review
OUT = ROOT / args.out
OUT.mkdir(parents=True, exist_ok=True)
review = json.loads(review_path.read_text())
board_path = ROOT / review["sourceFile"]
board_bytes = board_path.read_bytes()
board = json.loads(board_bytes)
sha = hashlib.sha256(board_bytes).hexdigest()
assert sha == review["sourceSha256"]
curves_path = Path(__file__).with_name("reference-curves.json")
curves = json.loads(curves_path.read_text())
PARTS = {"CL21A106KAYNNNE": "cl21a106", "CL05A225KO5NQNC": "cl05a225", "CL05B224KO5NNNC": "cl05b224"}


def interpolate(chart, x, log=False):
    xy = sorted((float(d["x"]), float(d["y"])) for d in chart["data"])
    xp, yp = np.array(xy).T
    return float(np.interp(np.log10(x) if log else x, np.log10(xp) if log else xp, yp))


@lru_cache(None)
def curve(part, kind, sub=None):
    charts = curves[part]["data"][kind]["charts"]
    return next(c for c in charts if sub is None or c["graphSubType"] == sub)


@lru_cache(None)
def part_values(part, capacitance, voltage, profile, frequency=2.5e6):
    dc = 1 + interpolate(curve(part, "DCBias"), voltage) / 100
    ac = 1 + interpolate(curve(part, "ACVolt"), .01) / 100
    factor = {"typical_dc": dc, "low_ac_sensitivity": dc * ac * .9 * .85,
              "half_nominal_sensitivity": .5 * .9 * .85}[profile]
    resistance = interpolate(curve(part, "|Z|_R", "R"), frequency / 1e6, log=True)
    # Infer the typical series ESL from the inductive impedance at 50 MHz.
    f = 50e6
    z50 = interpolate(curve(part, "|Z|_R", "|Z|"), f / 1e6, log=True)
    r50 = interpolate(curve(part, "|Z|_R", "R"), f / 1e6, log=True)
    esl = np.sqrt(max(0, z50*z50-r50*r50))/(2*np.pi*f) + 1/((2*np.pi*f)**2*capacitance)
    return capacitance * factor, resistance, esl, dc, ac


def bank(caps, voltage, profile, mount_nh, esr_factor=1, frequency=2.5e6):
    vals = [part_values(PARTS[c["manufacturer_part_number"]], c["capacitance"], voltage,
                        profile, frequency) for c in caps]
    ctotal = sum(v[0] for v in vals)
    # Low-frequency series-equivalent moments of the parallel bank. This
    # reduction does not reproduce its separate branch antiresonances.
    r = sum(v[1]*esr_factor*v[0]**2 for v in vals)/ctotal**2
    l = sum((v[2]+mount_nh*1e-9)*v[0]**2 for v in vals)/ctotal**2
    return np.array([ctotal, r, l])


rail_inputs = []
for r in review["rails"]:
    name = r["rail"]
    caps = [c for c in board if c["type"] == "source_component"
            and c.get("name", "").startswith("C_"+name+"_")
            and (c["name"].split("_")[-1].isdigit() or "_COUT" in c["name"])]
    source_caps = [c for c in caps if "_COUT" in c["name"]]
    load_caps = [c for c in caps if "_COUT" not in c["name"]]
    m = next(x for x in review["margins"]["converter"] if x["rail"] == name)
    assert len(source_caps) == 2
    assert abs(sum(c["capacitance"] for c in caps)*1e6 - m["nominalCapacitanceUF"]) < 1e-8
    current = loads['rails'][name]['designCurrentA'] if loads else review["bridgeCurrentProxy"]["research"]["pdxProxy"]["baselineCurrentA"][name]
    rail_inputs.append({**r, "requiredMaximumV": 1.95 if name == "VCCL" else 1.16,
                        "currentA": current, "sourceCaps": source_caps, "loadCaps": load_caps,
                        "linkResistanceOhm": r["dcDropWithMeshAllowanceAt3AMV"]/3000})


def ripple(r, profile, link_nh, mount_nh, vin, inductance, frequency, harmonics=51):
    vout = r["regulatorNominalV"]
    duty = vout / vin
    delta_i = vout*(1-duty)/(inductance*frequency)
    times = np.linspace(0, 1, 2048, endpoint=False)
    load = np.zeros_like(times)
    source = np.zeros_like(times)
    # Keep the separate parallel capacitor branches for the harmonic model.
    for h in range(1, harmonics+1):
        w = 2*np.pi*frequency*h
        def impedance(caps):
            admittance = 0j
            for c in caps:
                cap, esr, esl, *_ = part_values(PARTS[c["manufacturer_part_number"]], c["capacitance"], vout, profile, frequency*h)
                admittance += 1/(esr+1j*w*(esl+mount_nh*1e-9)+1/(1j*w*cap))
            return 1/admittance
        z0, z1 = impedance(r["sourceCaps"]), impedance(r["loadCaps"])
        zl = r["linkResistanceOhm"]+1j*w*link_nh*1e-9
        cn = delta_i*(np.exp(-2j*np.pi*h*duty)-1)/((2*np.pi*h)**2*duty*(1-duty))
        src = z0*(zl+z1)/(z0+zl+z1)
        dst = z0*z1/(z0+zl+z1)
        phase = np.exp(2j*np.pi*h*times)
        source += 2*np.real(cn*src*phase)
        load += 2*np.real(cn*dst*phase)
    return {"rail": r["rail"], "profile": profile, "linkNH": link_nh, "mountPerCapNH": mount_nh,
            "inputV": vin, "inductanceUH": inductance*1e6, "switchingMHz": frequency/1e6,
            "inductorRipplePPA": delta_i, "peakCurrentA": r["currentA"]+delta_i/2,
            "sourceRipplePPMV": float(np.ptp(source)*1000), "loadRipplePPMV": float(np.ptp(load)*1000),
            "loadTroughMV": float(-load.min()*1000), "loadPeakMV": float(load.max()*1000)}


def matrices(r, profile, link_nh, mount_nh, esr_factor=1):
    c0, e0, l0 = bank(r["sourceCaps"], r["regulatorNominalV"], profile, mount_nh, esr_factor)
    c1, e1, l1 = bank(r["loadCaps"], r["regulatorNominalV"], profile, mount_nh, esr_factor)
    resistance = r["linkResistanceOhm"]
    inductance = link_nh*1e-9+l0+l1
    # State: capacitor voltages and link current. Inputs: source/load currents
    # and their slopes. KVL includes bank ESR, ESL and the board resistance.
    A = np.array([[0,0,-1/c0],[0,0,1/c1],[1/inductance,-1/inductance,-(resistance+e0+e1)/inductance]])
    B = np.array([[1/c0,0,0,0],[0,-1/c1,0,0],[e0/inductance,e1/inductance,l0/inductance,l1/inductance]])
    C = np.array([0,1,e1])+l1*A[2]
    D = np.array([0,-e1,0,-l1])+l1*B[2]
    return A, B, C, D, dict(C0=c0,C1=c1,R0=e0,R1=e1,L0=l0,L1=l1,Rlink=resistance,Llink=link_nh*1e-9)


def ramp(t, start, duration):
    value = np.clip((t-start)/duration, 0, 1)
    slope = np.where((t > start) & (t < start+duration), 1/duration, 0)
    return value, slope


def transient(r, profile, link_nh, mount_nh, fraction, delay_us, direction, rise_ns=200,
              esr_factor=1, samples_per_us=200, return_wave=False):
    A, B, C, D, params = matrices(r, profile, link_nh, mount_nh, esr_factor)
    di = fraction*r["currentA"]
    initial_load = r["currentA"]-di if direction == "up" else r["currentA"]
    sign = 1 if direction == "up" else -1
    rise = rise_ns*1e-9
    # Optimistically fast buck current slew after an assumed detection delay.
    # No actual controller, voltage recovery, package or ground is modeled.
    slew = ((4.75-r["regulatorNominalV"]) if direction == "up" else r["regulatorNominalV"])/1.2e-6
    response_rise = max(rise, di/slew)
    t0 = .25e-6
    end = t0+delay_us*1e-6+response_rise+2e-6
    # Stop after the assumed current response and passive redistribution.
    # Later voltage recovery cannot be inferred from this current-source model.
    t = np.linspace(0, end, int(np.ceil(end*samples_per_us*1e6))+1)
    lr, ld = ramp(t, t0, rise)
    rr, rd = ramp(t, t0+delay_us*1e-6, response_rise)
    U = np.array([initial_load+sign*di*rr, initial_load+sign*di*lr, sign*di*rd, sign*di*ld]).T
    x = np.array([r["regulatorNominalV"], r["regulatorNominalV"]-params["Rlink"]*initial_load, initial_load])
    # Exact first-order-hold state transition for each interval. Derivative
    # discontinuities are resolved by the sample-convergence check below.
    dt = t[1]-t[0]
    aug = np.zeros((11,11))
    aug[:3,:3] = A
    aug[:3,3:7] = B
    aug[3:7,7:11] = np.eye(4)
    E = expm(aug*dt)
    y = np.empty(len(t))
    for k in range(len(t)):
        y[k] = C@x+D@U[k]
        if k+1 < len(t):
            z = E@np.r_[x,U[k],(U[k+1]-U[k])/dt]
            x = z[:3]
    initial_v = r["regulatorNominalV"]-params["Rlink"]*initial_load
    final_load = initial_load+sign*di
    final_static = r["regulatorNominalV"]-params["Rlink"]*final_load
    low_corner = y + (r["regulatorMinimumV"]-r["regulatorNominalV"])
    high_corner = y + (r["regulatorMaximumV"]-r["regulatorNominalV"])
    result = {"rail":r["rail"], "profile":profile,"linkNH":link_nh,"mountPerCapNH":mount_nh,"esrFactor":esr_factor,
              "stepFractionOfSelectedCurrent":fraction,
              **({"stepFractionOfPDMaximum":fraction} if loads is None else {}),
              "currentBasis":current_label,"stepA":di,"initialCurrentA":initial_load,"finalCurrentA":final_load,
              "direction":direction,"assumedDelayUS":delay_us,"loadRiseNS":rise_ns,"assumedCurrentRiseUS":response_rise*1e6,
              "initialNominalPinV":initial_v,"finalNominalStaticPinV":final_static,
              "nominalMinimumV":float(y.min()),"nominalMaximumV":float(y.max()),
              "lowToleranceMinimumV":float(low_corner.min()),"highToleranceMaximumV":float(high_corner.max()),
              "extraUndershootBelowFinalStaticMV":float(max(0,final_static-y.min())*1000),
              "droopFromInitialMV":float((initial_v-y.min())*1000),
              "overshootFromInitialMV":float((y.max()-initial_v)*1000),
              "effectiveCapacitanceUF":(params["C0"]+params["C1"])*1e6,
              "lowCornerMarginBeforeRippleMV":float((low_corner.min()-r["minimumRequiredV"])*1000),
              "highCornerMarginBeforeRippleMV":float((r["requiredMaximumV"]-high_corner.max())*1000)}
    if return_wave:
        return result, t, y, U, params
    return result


profiles = ["typical_dc", "low_ac_sensitivity", "half_nominal_sensitivity"]
ripple_cases = [ripple(r,p,link,mount,vin,ind,freq) for r,p,link,mount,vin,ind,freq in itertools.product(
    rail_inputs, profiles,[1,5,20],[.2,1],[4.75,5.25],[.72e-6,1.2e-6],[2.25e6,2.75e6])]
transient_cases = [transient(r,p,link,mount,fraction,delay,direction) for r,p,link,mount,fraction,delay,direction in itertools.product(
    rail_inputs,profiles,[1,5,20],[.2,1],[.1,.25,.5,1],[0,.2,.5,1,2], ["up","down"])]
edge_cases = [transient(r,"low_ac_sensitivity",5,1,.5,.5,direction,rise_ns=rise,esr_factor=esr)
              for r,direction,rise,esr in itertools.product(rail_inputs,["up","down"],[50,200,1000,10000],[.5,2])]
guardband_cases=[]
for r in rail_inputs:
    guarded={**r,"currentA":review["bridgeCurrentProxy"]["research"]["pdxProxy"]["roundedGuardbandCaseA"][r["rail"]]}
    for direction,delay in itertools.product(["up","down"],[0,.2,.5,1]):
        c=transient(guarded,"low_ac_sensitivity",5,1,.5,delay,direction)
        c["currentCase"]="Rounded guardband; not a guaranteed PDX limit"
        guardband_cases.append(c)

summaries = []
for r in rail_inputs:
    rs = [c for c in ripple_cases if c["rail"] == r["rail"]]
    nominal = ripple(r,"typical_dc",5,.2,5,1e-6,2.5e6)
    nominal_transient = [transient(r,"low_ac_sensitivity",5,1,.5,.5,d) for d in ["up","down"]]
    trough = max(c["loadTroughMV"] for c in rs)
    peak = max(c["loadPeakMV"] for c in rs)
    for c in transient_cases+edge_cases+guardband_cases+nominal_transient:
        if c["rail"] == r["rail"]:
            c["lowCornerMarginWithRippleMV"] = c["lowCornerMarginBeforeRippleMV"]-trough
            c["highCornerMarginWithRippleMV"] = c["highCornerMarginBeforeRippleMV"]-peak
    summaries.append({"rail":r["rail"],"selectedCurrentA":r["currentA"],"currentBasis":current_label,
                      **({"proxyCurrentA":r["currentA"]} if loads is None else {}),"nominalRipple":nominal,
                      "rippleRangePPMV":[min(c["loadRipplePPMV"] for c in rs),max(c["loadRipplePPMV"] for c in rs)],
                      "sourceRippleRangePPMV":[min(c["sourceRipplePPMV"] for c in rs),max(c["sourceRipplePPMV"] for c in rs)],
                      "worstRippleTroughMV":trough,"worstRipplePeakMV":peak,
                      "minimumRemainingStaticAfterRippleMV":r["remainingStaticMarginMV"]-r["linkResistanceOhm"]*r["currentA"]*1000-trough,
                      "halfLoadStepExample":nominal_transient,
                      "peakInductorCurrentUpperA":max(c["peakCurrentA"] for c in rs)})

# Numeric controls: independent exact capacitor charge, DC invariance,
# harmonic convergence, integration convergence and an ngspice-ready deck.
checks = []
for r in rail_inputs:
    A,B,C,D,p = matrices(r,"low_ac_sensitivity",5,1)
    i = r["currentA"]
    x = np.array([r["regulatorNominalV"],r["regulatorNominalV"]-p["Rlink"]*i,i])
    derivative = A@x+B@np.array([i,i,0,0])
    residual = float(np.max(np.abs(derivative)))
    checks.append({"name":r["rail"]+" DC equilibrium", "maxStateDerivative":residual,"passed":residual<1e-5})
    drive=np.array([i*.8,i*.3,1e5,-2e5])
    dx=A@x+B@drive
    error=abs(p["C0"]*dx[0]+p["C1"]*dx[1]-(drive[0]-drive[1]))
    checks.append({"name":r["rail"]+" capacitor charge conservation","currentBalanceErrorA":float(error),"passed":bool(error<1e-10)})
    a = transient(r,"low_ac_sensitivity",5,1,.5,.5,"up",samples_per_us=200)
    b = transient(r,"low_ac_sensitivity",5,1,.5,.5,"up",samples_per_us=800)
    error = abs(a["nominalMinimumV"]-b["nominalMinimumV"])*1000
    checks.append({"name":r["rail"]+" timestep convergence", "minimumDifferenceMV":error,"passed":error<.1})
    a,b = [ripple(r,"low_ac_sensitivity",5,1,5.25,.72e-6,2.25e6,harmonics=h) for h in [51,101]]
    error=abs(a["loadRipplePPMV"]-b["loadRipplePPMV"])
    checks.append({"name":r["rail"]+" harmonic convergence", "peakToPeakDifferenceMV":error,"passed":error<.02})

selected = rail_inputs[1]
case,t,y,U,p = transient(selected,"low_ac_sensitivity",5,1,.5,.5,"up",samples_per_us=800,return_wave=True)
# This cross-check uses the same prescribed currents in a separate circuit solver.
def pwl(column):
    # Preserve the original response breakpoints and sample interpolation.
    return "PWL("+" ".join(f"{ti:.12g} {ui:.12g}" for ti,ui in zip(t,column))+")"
deck = f"""VDD passive first-response cross-check (no regulator model)
Isource 0 source {pwl(U[:,0])}
Iload load 0 {pwl(U[:,1])}
Rlink source mid {p['Rlink']:.15g}
Llink mid load {p['Llink']:.15g} IC={case['initialCurrentA']:.15g}
R0 source cs0 {p['R0']:.15g}
L0 cs0 cc0 {p['L0']:.15g} IC=0
C0 cc0 0 {p['C0']:.15g} IC={selected['regulatorNominalV']:.15g}
R1 load cs1 {p['R1']:.15g}
L1 cs1 cc1 {p['L1']:.15g} IC=0
C1 cc1 0 {p['C1']:.15g} IC={case['initialNominalPinV']:.15g}
.options reltol=1e-7 abstol=1e-10 vntol=1e-9 method=gear
.tran 1n {np.floor(t[-1]/1e-7)*1e-7:.10g} 0 1n UIC
.end
"""
(OUT / "passive-crosscheck.cir").write_text(deck)
(OUT / "passive-crosscheck-reference.json").write_text(json.dumps({"time":t.tolist(),"voltage":y.tolist(),"case":case},indent=2)+"\n")

# Plots show the low-voltage tolerance corner; they do not imply actual loads.
fig,axes = plt.subplots(1,2,figsize=(12,4.5))
for ax,r in zip(axes,rail_inputs):
    for delay in [0,.2,.5,1]:
        result,t,y,_,_ = transient(r,"low_ac_sensitivity",5,1,.5,delay,"up",samples_per_us=800,return_wave=True)
        ax.plot((t-.25e-6)*1e6,y+r["regulatorMinimumV"]-r["regulatorNominalV"],label=f"Assumed delay {delay:g} µs")
    ax.axhline(r["minimumRequiredV"],color="firebrick",ls="--",label="Rail minimum")
    ax.set(title=f"{r['rail']}: {r['currentA']/2:g} → {r['currentA']:g} A",xlabel="Time from load change (µs)",ylabel="Pin voltage at low tolerance (V)")
    ax.grid(alpha=.25);ax.legend(fontsize=8)
fig.suptitle("Conditional first response: 200 ns load rise, 5 nH link, reduced capacitance\nPrescribed fastest current catch-up; no TPS62903 control-loop or recovery model",fontsize=10)
fig.tight_layout();fig.savefig(OUT/"first-response.png",dpi=170);plt.close(fig)
fig,ax=plt.subplots(figsize=(8,4))
for r in rail_inputs:
    for profile,style in [("typical_dc","-"),("low_ac_sensitivity","--")]:
        cs=[transient(r,profile,5,1,.5,delay,"up") for delay in np.linspace(0,2,41)]
        ax.plot([c["assumedDelayUS"] for c in cs],[c["lowCornerMarginBeforeRippleMV"] for c in cs],style,label=r["rail"]+" / "+profile.replace("_"," "))
ax.axhline(0,color="firebrick",ls=":")
ax.set(xlabel="Assumed delay before fastest possible current response (µs)",ylabel="Minimum voltage margin before ripple (mV)",title="50% → 100% of selected load; low voltage tolerance corner")
ax.grid(alpha=.25);ax.legend(fontsize=8);fig.tight_layout();fig.savefig(OUT/"delay-sensitivity.png",dpi=170);plt.close(fig)

limitations = [
    "Selected currents are provisional PDX design assumptions, not measured or guaranteed limits. Idle current, current spectrum and load edge rates are unknown.",
    "TI PSpice SLVMDN8 and SIMPLIS SLVMDP3 packages contain encrypted models. No vendor closed-loop transient simulation was run.",
    "Switching ripple is a forced-PWM triangular-current harmonic calculation. It excludes controller jitter, switch-node coupling, common ground, package and probe noise.",
    "Samsung curves are typical at their stated measurement conditions. Multiplying DC-bias, 10 mV AC, tolerance and temperature factors is a sensitivity construction, not a guaranteed joint capacitor model. Low AC amplitude below 10 mV is outside the published curve.",
    "Switching frequency 2.25–2.75 MHz and inductor 0.72–1.2 uH are sensitivity assumptions. They are not guaranteed switching-frequency limits.",
    "Interconnect inductance 1–20 nH and mounting inductance 0.2–1 nH per capacitor are assumed, not extracted. The 80 C board resistance and mesh allowance come from the previous DC analysis; ground and package losses remain excluded.",
    "The transient network reduces each physical capacitor bank to one series RLC using low-frequency moments and typical ESR at 2.5 MHz. ESR x0.5/x2 and edge-rate cases are separate sensitivities. Distributed branch antiresonance and unequal ball currents remain unmodeled.",
    "Transient source current starts after a prescribed 0–2 us delay, then catches up at the ideal maximum buck slew with a 1.2 uH inductor. This is optimistic after the assumed delay, not a TPS62903 transfer function. It predicts a conditional first dip/peak only; the apparent later offset is not a voltage recovery prediction.",
    "Minimum and maximum voltage corners are evaluated separately. Ripple phase is conservatively aligned with the transient extremum. No pass fraction is a probability.",
    "No startup, short circuit, thermal qualification, complete SI/BER simulation or hardware measurement is added by this analysis."
]
result = {"sourceFile":review["sourceFile"],"sourceSha256":sha,"dateLocal":review.get("dateLocal","2026-10-21"),
          "model":"Passive PDN with prescribed current response; conditional engineering sensitivity",
          "closedLoopValidated":False,"currentResearchFile":loads['currentResearchFile'] if loads else review["bridgeCurrentProxy"]["researchFile"],
          "currentAssumptions":{"label":current_label,"file":str(loads_path.relative_to(ROOT)) if loads_path else None,
          "rails":loads['rails'] if loads else {r['rail']:{'designCurrentA':r['currentA']} for r in rail_inputs}},
          "summary":summaries,"capacitanceCases":[{"rail":r["rail"],"profile":profile,
          "sourceUF":bank(r["sourceCaps"],r["regulatorNominalV"],profile,1)[0]*1e6,
          "loadUF":bank(r["loadCaps"],r["regulatorNominalV"],profile,1)[0]*1e6} for r,profile in itertools.product(rail_inputs,profiles)],
          "rippleCases":ripple_cases,"transientCases":transient_cases,"edgeAndEsrCases":edge_cases,"guardbandCases":guardband_cases,"numericChecks":checks,
          "limitations":limitations,"references":[{"title":"TI TPS62903 datasheet","url":"https://www.ti.com/lit/ds/symlink/tps62903.pdf"},
          {"title":"TI TPS62903 EVM user guide","url":"https://www.ti.com/lit/ug/snvu745a/snvu745a.pdf"},
          *[{"title":k,"url":v["url"]} for k,v in curves.items()]],
          "inputSha256":{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),curves_path,board_path,review_path,ROOT/review["bridgeCurrentProxy"]["researchFile"],*([loads_path, ROOT/loads['currentResearchFile']] if loads_path else [])]}}
(OUT/"results.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps({"sourceSha256":sha,"summary":summaries,"capacitanceCases":result["capacitanceCases"],"numericChecks":checks},indent=2))
assert all(c["passed"] for c in checks), "Numeric control failed"
