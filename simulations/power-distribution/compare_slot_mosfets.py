"""Compare datasheet Rds limits against the unchanged, source-bound copper screen."""
import hashlib
import html
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "dist/slot-power-mosfet-review"
INPUT = ROOT / "datasheets/research/slot-mosfet-2026-10-22/comparison-inputs.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def table(headings, rows):
    cell = lambda value: html.escape(str(value))
    return "<div class='scroll'><table><thead><tr>" + "".join(
        f"<th>{cell(v)}</th>" for v in headings
    ) + "</tr></thead><tbody>" + "".join(
        "<tr>" + "".join(f"<td>{cell(v)}</td>" for v in row) + "</tr>" for row in rows
    ) + "</tbody></table></div>"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    config = json.loads(INPUT.read_text())
    board = ROOT / "dist/board.circuit.json"
    copper_file = ROOT / config["copperResults"]
    copper = json.loads(copper_file.read_text())
    assert digest(board) == config["boardSha256"] == copper["sourceSha256"]
    channel = next(r for r in copper["channels"] if r["rail"] == "12V")
    amps = config["currentA"]
    assert amps == channel["currentA"] == 5.5
    conductor = channel["conductorUpperDropMV"]
    baseline_drop = amps * config["parts"][0]["rds25MaxMilliOhm"]
    cases = []
    for p in config["parts"]:
        drop = amps * p["rds25MaxMilliOhm"]
        total = conductor + drop
        row = dict(p, mosfet25DropMV=drop, mosfet25DissipationW=amps * drop / 1000,
                   copperMV=conductor, total25ScreenMV=total,
                   savedVsExistingMV=baseline_drop - drop,
                   totalDropReductionPercent=100 * (baseline_drop - drop) / (conductor + baseline_drop))
        row["voltageCases"] = [dict(inputV=v, slotV=v-total/1000,
            marginMV=(v-config["slotMinimumV"])*1000-total) for v in config["inputCasesV"]]
        hot = p["rds125MaxMilliOhmAtMinus10V"]
        row["mosfet125DropMV"] = None if hot is None else amps * hot
        row["mosfet125DissipationW"] = None if hot is None else amps * amps * hot / 1000
        row["totalWith125CMosfetMV"] = None if hot is None else conductor + amps * hot
        if "productTableRds25MaxMilliOhm" in p:
            rds = p["productTableRds25MaxMilliOhm"]
            row["htmlTableSensitivity"] = dict(rdsMilliOhm=rds, mosfetDropMV=amps*rds,
                totalScreenMV=conductor+amps*rds, savedVsExistingMV=baseline_drop-amps*rds)
        cases.append(row)

    circuit = json.loads(board.read_text())
    sources = {c["name"]: c for c in circuit if c["type"] == "source_component"}
    assert sources["Q_SLOT_12V"]["manufacturer_part_number"] == "AO4407A"
    gate_r = sources["R_SLOT_GATE_12V"]["resistance"]
    pull_r = sources["R_SLOT_OFF_12V"]["resistance"]
    gate_c = sources["C_SLOT_GATE_12V"]["capacitance"]
    assert gate_r == 510 and pull_r == 100000 and gate_c == 10e-6
    gate_drive = []
    input_drop = next(r for r in copper["results"] if r["rail"] == "V12V")["withMeshAllowanceMV"] / 1000
    for v in [11.2, 12, 12.6]:
        vs = v-input_drop
        # DC approximation: driver on-resistance and gate leakage omitted.
        magnitude = vs * pull_r / (pull_r+gate_r)
        gate_drive.append(dict(inputV=v, sourceV=vs, vgsV=-magnitude))
    assert min(abs(r["vgsV"]) for r in gate_drive) > 10
    assert max(abs(r["vgsV"]) for r in gate_drive) < 20

    before = json.loads((OUT / "preservation-before.json").read_text())
    changed = [name for name, value in before.items() if not (ROOT/name).exists() or digest(ROOT/name) != value]
    assert not changed, changed
    evidence = [INPUT, copper_file, Path(__file__), ROOT/"components/SlotPower.tsx", ROOT/"imports/AO4407A.tsx"]
    evidence += [ROOT/p["datasheetLocal"] for p in config["parts"]]
    evidence += [INPUT.parent/"SO8.pdf", INPUT.parent/"DFN5x6_8L_EP1_P.pdf"]
    result = dict(dateLocal=config["checkedOnLocal"], scope=config["scope"], sourceSha256=digest(board),
        method="Vdrop = I * Rds; device heat = I^2 * Rds. Copper results are reused unchanged. No new electromagnetic or switching simulation.",
        copperTemperatureC=copper["copperTemperatureC"], copperMV=conductor,
        copperFineGridOnlyMV=sum(next(r for r in copper["results"] if r["rail"] == net)["fine"]["dropMV"] for net in ["V12V", "SLOT_12V"]),
        currentA=amps, parts=cases,
        idealZeroResistanceMosfet=dict(totalScreenMV=conductor, input112MarginMV=160-conductor),
        gateCircuit=dict(seriesResistanceOhm=gate_r, offPullupOhm=pull_r, nominalGateCapacitanceF=gate_c,
            nominalOnRCTimeConstantMs=gate_r*gate_c*1000, nominalOffRCTimeConstantS=pull_r*gate_c,
            approximateDcGateDrive=gate_drive,
            note="Steady on-state voltage rating check only. Actual timing depends on capacitor bias, threshold, leakage, driver and Miller behavior."),
        preservation=dict(passed=True, filesCompared=len(before), changedFiles=changed, boardUnchanged=True,
            installed12VMosfet=sources["Q_SLOT_12V"]["manufacturer_part_number"],
            installed33VMosfet=sources["Q_SLOT_3V3"]["manufacturer_part_number"]),
        limitations=[
            "The main comparison combines 80 C copper with 25 C maximum MOSFET resistance. It is not a complete hot-path bound.",
            "The 125 C cases use tabulated maximum resistance at VGS=-10 V. Copper stays at 80 C. No board thermal solution is implied.",
            "Connector contacts, solder joints, ground return, dynamic dips, startup, shutdown and faults are not qualified.",
            "Device Rds includes the device resistance measured at its terminals; do not add package resistance a second time.",
            "The DFN cases hold the old copper constant. New footprints and local pours require a fresh layout and resistance check.",
            "SOA ratings depend on pulse duration, voltage, temperature and mounting. Low on-resistance and high current ratings do not qualify startup.",
            "The 5.5 A case is a 12 V rail stress case. Combined card power must remain within its 75 W budget."
        ], inputSha256={str(p.relative_to(ROOT)): digest(p) for p in evidence})
    (OUT/"results.json").write_text(json.dumps(result, indent=2)+"\n")

    fig, ax = plt.subplots(figsize=(10, 5.6), layout="constrained")
    labels = [p["part"] for p in cases] + ["Ideal 0 ohm"]
    ys = list(range(len(labels)))
    ax.barh(ys, [conductor]*len(labels), label="Unchanged copper, 80 C + mesh allowance", color="#b2c5d4")
    ax.barh(ys, [p["mosfet25DropMV"] for p in cases]+[0], left=conductor,
        label="MOSFET, maximum Rds at 25 C", color="#267463")
    for y, value in zip(ys, [p["total25ScreenMV"] for p in cases]+[conductor]):
        ax.text(value+3, y, f"{value:.1f} mV", va="center", fontsize=10)
    ax.axvline(160, ls="--", color="#a1472d", label="160 mV budget at 11.20 V input")
    ax.set(yticks=ys, yticklabels=labels, xlim=(0, 360), xlabel="Copper + MOSFET voltage drop at 5.5 A (mV)",
           title="Lower MOSFET resistance helps; copper remains the main loss")
    ax.invert_yaxis()
    ax.grid(axis="x", alpha=.15)
    ax.legend(loc="upper center", bbox_to_anchor=(.5, -.16), fontsize=9, frameon=False)
    fig.savefig(OUT/"comparison.png", dpi=160)
    plt.close(fig)

    main_rows = [[p["part"], f"{p['rds25MaxMilliOhm']:g}", f"{p['mosfet25DropMV']:.1f}",
        f"{p['mosfet25DissipationW']:.3f}", f"{p['savedVsExistingMV']:.1f}", f"{p['total25ScreenMV']:.1f}",
        "New DFN footprint" if p["footprintChangeRequired"] else "Existing SO8 package"] for p in cases]
    voltage_rows = [[p["part"]]+[f"{v['slotV']:.4f} V" for v in p["voltageCases"]] for p in cases]
    voltage_rows.append(["Ideal 0 ohm"]+[f"{v-conductor/1000:.4f} V" for v in config["inputCasesV"]])
    hot_rows = [[p["part"], "Not tabulated at -10 V" if p["mosfet125DropMV"] is None else f"{p['mosfet125DropMV']:.1f} mV",
        "-" if p["totalWith125CMosfetMV"] is None else f"{p['totalWith125CMosfetMV']:.1f} mV"] for p in cases]
    gate_rows = [[p["part"], f"{p['vgsAbsoluteMagnitudeV']:g} V", f"{p['qg10TypicalNC']:g} / {p['qg10MaxNC']:g} nC",
        f"{p['internalGateResistanceTypicalOhm']:g} / {p['internalGateResistanceMaxOhm']:g} ohm"] for p in cases]
    sources_html = "".join(f"<li><a href='{p['datasheetUrl']}'>{p['part']} manufacturer datasheet</a>, revision {p['datasheetRevision']}. "
        f"<a href='{p['productUrl']}'>Product status and package</a>.</li>" for p in cases)
    limitations = "".join(f"<li>{html.escape(x)}</li>" for x in result["limitations"])
    page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>12 V slot MOSFET comparison</title><style>
body{{margin:0;background:#f4f7fa;color:#203748;font:16px/1.6 system-ui,sans-serif}}main{{max-width:1100px;margin:auto;padding:32px 24px 64px}}
h1{{line-height:1.2}}h2{{margin-top:32px;font-size:22px}}p{{max-width:95ch}}a{{color:#005f8d}}.card{{background:white;border-left:5px solid #247565;padding:16px 22px}}
.warning{{border-left-color:#b96e28;background:#fff1df}}table{{border-collapse:collapse;width:100%;background:white;font-size:14px;margin:16px 0}}
th,td{{text-align:left;padding:10px;border-bottom:1px solid #dce4ea}}th{{background:#e4edf2}}.scroll{{overflow-x:auto}}img{{max-width:100%}}li{{margin:8px 0}}code{{font-size:12px;overflow-wrap:anywhere}}
</style><main><p>22 October 2026 | Research only | 12 V slot switch at 5.5 A</p><h1>Lower-resistance MOSFET options</h1>
<div class="card"><p><strong>AONS21303C saves about 56 mV in the fixed-copper comparison.</strong> It needs a new DFN footprint.</p>
<p>AO4447A uses the existing SO8 package and pin assignment. It saves 33-40 mV, depending on the manufacturer specification used.</p>
<p>The installed AO4407A, board layout and BOM remain unchanged.</p></div>
<h2>DC comparison</h2><p>All resistance values use VGS = -10 V. The main table uses maximum resistance at a 25 C junction temperature.</p>
<p>Copper stays at 80 C with the previous mesh allowance. Voltage drop equals current times resistance. MOSFET heat equals current squared times resistance.</p>
{table(['Part','Rds max (milliohm)','MOSFET drop (mV)','MOSFET heat (W)','Saved (mV)','Copper + MOSFET (mV)','PCB package'], main_rows)}
<p>AO4447A has conflicting manufacturer entries. The linked January 2024 PDF states 5.8 milliohm. The HTML table states 7 milliohm.</p>
<p>The HTML value gives 38.5 mV MOSFET loss and 266.3 mV total loss. The PDF value gives 31.9 mV and 259.7 mV.</p>
<p>A supplied part must match the PDF revision before the lower limit can support the design.</p>
<img src="comparison.png" alt="Copper and MOSFET voltage loss for the current part, three candidates, and an ideal switch">
<h2>Voltage available at the slot</h2>
{table(['Part','12.00 V input','11.40 V input','11.20 V input'], voltage_rows)}
<div class="card warning"><p><strong>None of these choices closes the 11.20 V input case.</strong> The slot minimum used in this review is 11.04 V.</p>
<p>The available drop is 160 mV. Copper alone accounts for {conductor:.1f} mV with allowance.</p>
<p>Even the fine-grid copper result before allowance is {result['copperFineGridOnlyMV']:.1f} mV. A MOSFET change alone cannot close this model's budget.</p>
<p>AONS21303C gives 10.9568 V at the slot in this screen. That is 83.2 mV below the minimum before omitted losses.</p></div>
<h2>Hot MOSFET check</h2><p>The candidate datasheets also give maximum resistance at a 125 C junction temperature and VGS = -10 V.</p>
{table(['Part','MOSFET drop at 125 C','Total with unchanged 80 C copper'], hot_rows)}
<p>These are resistance calculations at specified temperatures. They do not predict the board temperature or establish a complete hot-path limit.</p>
<h2>Gate drive and footprint checks</h2>
<p>The actual source uses a 510 ohm gate resistor, a 100 kilohm pullup and a nominal 10 microfarad gate-to-source capacitor.</p>
<p>The nominal on-time constant is 5.1 ms. The nominal off-time constant is 1 s. Actual switching times need a separate analysis.</p>
<p>The steady on-state estimate gives VGS from -11.09 V to -12.48 V across the reviewed input range.</p>
<p>All three candidates retain a -30 V drain rating. Their gate ratings tolerate the reviewed steady drive.</p>
{table(['Part','Absolute gate rating, magnitude','Gate charge at 10 V, typical / max','Internal gate resistance, typical / max'], gate_rows)}
<p>AO4447A matches pins 1-3 Source, 4 Gate and 5-8 Drain. It shares the SO8 outline and 1.27 mm pin pitch.</p>
<p>The existing pad row centers are 5.20 mm apart. The manufacturer's recommended SO8 land pattern uses 5.74 mm.</p>
<p>This difference also applies to the installed AO4407A. Package compatibility does not establish solder-land approval.</p>
<p>The DFN parts need an exposed drain pad and a new land pattern. Their loss estimates hold the old copper constant.</p>
<p>AON6407 offers lower gate charge than AONS21303C. AONS21303C offers the lowest DC resistance among the parts compared.</p>
<p>AO4447A also has much higher internal gate resistance than the installed part. The gate capacitor does not remove the need for a switching check.</p>
<p>Startup, shutdown and safe operating area remain open for every candidate. The current ratings alone do not establish safe switching.</p>
<h2>Scope and preservation</h2><ul>{limitations}</ul>
<p>File hashes show that all {len(before)} recorded board, source and configuration files remain unchanged. Q_SLOT_12V remains AO4407A.</p>
<p>Board SHA-256: <code>{digest(board)}</code></p>
<h2>Evidence</h2><p><a href="results.json">Calculations, limitations and file hashes</a> | <a href="../slot-power-copper-review/report.html">Previous copper review</a></p>
<ul>{sources_html}</ul><p><a href='{config['packageSources'][0]}'>SO8 outline and lands</a> | <a href='{config['packageSources'][1]}'>DFN outline and lands</a></p>
<p><a href='{config['budgetSources'][0]}'>Intel ATX input voltage range</a> | <a href='{config['budgetSources'][1]}'>Intel card voltage range</a></p>
<p>Manufacturer pages list the candidates in full production. Assembly sourcing and stock are not qualified.</p>
</main></html>"""
    (OUT/"report.html").write_text(page)
    print(json.dumps({"report": str(OUT/"report.html"), "copperMV": conductor,
        "parts": [{key: p[key] for key in ["part", "mosfet25DropMV", "savedVsExistingMV", "total25ScreenMV"]} for p in cases],
        "preservation": result["preservation"]}, indent=2))


if __name__ == "__main__":
    main()
