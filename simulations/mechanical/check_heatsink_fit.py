"""Review a flat 15 mm heatsink prism; no PCB or copper is changed.

Use the current source build, not the preview's generic bounding-box heights.
All Z dimensions in this report are measured from the PCB top surface.
"""
import hashlib
import html
import json
import math
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "dist/heatsink-fit"
OUT.mkdir(parents=True, exist_ok=True)
source = Path(sys.argv[1] if len(sys.argv)>1 else "dist/heatsink-fit/current.circuit.json")
if not source.is_absolute():
    source=ROOT/source
board=json.loads(source.read_bytes())
sources={p["source_component_id"]:p for p in board if p["type"]=="source_component"}
parts={sources[p["source_component_id"]]["name"]:p for p in board if p["type"]=="pcb_component" and p.get("source_component_id") in sources}
bridge=parts["ASM2464PDX"]
cx,cy=bridge["center"]["x"],bridge["center"]["y"]
pcb=next(p for p in board if p["type"]=="pcb_board")

# Local body dimensions, not solder-land sizes. Values are maxima unless a
# reference value is explicitly identified. Local axes match each import.
profiles={
 "CL05A225KO5NQNC":(1.10,.60,.60,"datasheets/CL05A225KO5NQNC.pdf"),
 "CL05B224KO5NNNC":(1.05,.55,.55,"datasheets/CL05B224KO5NNNC.pdf"),
 "CL05A105KA5NQNC":(1.10,.60,.60,"datasheets/CL05A105KA5NQNC.pdf"),
 "TCC0402COG100J500AT":(1.05,.55,.55,"datasheets/TCC0402COG100J500AT.pdf"),
 "CL21A106KAYNNNE":(2.20,1.45,1.45,"datasheets/CL21A106KAYNNNE.pdf"),
 "XXCBCLNANF-25M":(3.40,2.70,.90,"datasheets/XXCBCLNANF-25M.pdf"),
 "W25Q32JVSSIQ":(5.38,8.10,2.16,"datasheets/W25Q32JV.pdf"),
}
for mpn in {p.get("manufacturer_part_number") for p in sources.values()}:
    if mpn and mpn.startswith("0402WGF"):
        profiles[mpn]=(1.10,.55,.40,"datasheets/0402WGF1003TCE.pdf")

def rect(x,y,w,h):
    return dict(minX=x-w/2,maxX=x+w/2,minY=y-h/2,maxY=y+h/2)

def expand(r,d):
    return {k:v+(-d if k.startswith("min") else d) for k,v in r.items()}

def overlap(a,b):
    return max(0,min(a["maxX"],b["maxX"])-max(a["minX"],b["minX"]))*max(0,min(a["maxY"],b["maxY"])-max(a["minY"],b["minY"]))

def separation(a,b):
    return math.hypot(max(0,a["minX"]-b["maxX"],b["minX"]-a["maxX"]),max(0,a["minY"]-b["maxY"],b["minY"]-a["maxY"]))

def courtyard_bounds(p):
    r=rect(p["center"]["x"],p["center"]["y"],p["width"],p["height"])
    for c in board:
        if c.get("pcb_component_id")!=p["pcb_component_id"] or not c["type"].startswith("pcb_courtyard_"):
            continue
        if "outline" in c:
            x=[v["x"] for v in c["outline"]];y=[v["y"] for v in c["outline"]]
            q=dict(minX=min(x),maxX=max(x),minY=min(y),maxY=max(y))
        elif "width" in c and "height" in c:
            angle=math.radians(c.get("ccw_rotation",0));w,h=c["width"],c["height"]
            q=rect(c["center"]["x"],c["center"]["y"],abs(w*math.cos(angle))+abs(h*math.sin(angle)),abs(w*math.sin(angle))+abs(h*math.cos(angle)))
        else:
            continue
        r={k:(min(r[k],q[k]) if k.startswith("min") else max(r[k],q[k])) for k in r}
    return r

objects=[]
for name,p in parts.items():
    if name=="ASM2464PDX" or p["layer"]!="top":
        continue
    s=sources[p["source_component_id"]]
    profile=profiles.get(s.get("manufacturer_part_number"))
    r=courtyard_bounds(p)
    if profile:
        length,width,height,ref=profile
        a=math.radians(p["rotation"])
        w,h=abs(length*math.cos(a))+abs(width*math.sin(a)),abs(length*math.sin(a))+abs(width*math.cos(a))
        r=rect(p["center"]["x"],p["center"]["y"],w,h)
    else:
        height=None;ref=None
    objects.append(dict(name=name,part=s.get("manufacturer_part_number"),bounds=r,bodyMaximumHeightMM=height,reference=ref,
                        geometry="manufacturer package maximum" if profile else "union of emitted footprint and courtyard; height unknown"))

# Explicit assembly sensitivities, not supplier guarantees. The bridge data
# give maximum A=0.982 mm, but no guaranteed minimum total package height.
assumptions=dict(heatsinkNominalMM=[15,15,15],heatsinkMinimumSensitivityEnvelopeMM=[14.8,14.8,14.8],heatsinkMaximumEnvelopeMM=[15.2,15.2,15.2],
    heatsinkPlacementToleranceEachAxisMM=.25,componentPlacementToleranceEachAxisMM=.05,
    passiveSolderStandOffAllowanceMM=.10,minimumVerticalClearanceMM=.10,
    tapeNominalThicknessMM=.125,tapeMinimumSensitivityThicknessMM=.10,
    tapeMaximumSensitivityThicknessMM=.15,
    bridgeMaximumHeightMM=.982,bridgeReferenceHeightRangeMM=[.48+.272+.12,.48+.272+.20],
    bridgeHeightMinimumGuaranteed=False,
    bridgeReferenceHeightMethod="M=0.480 ref + S=0.272 ref + A1=0.120..0.200; reference construction only")
minimum_base=.60+assumptions["passiveSolderStandOffAllowanceMM"]+assumptions["minimumVerticalClearanceMM"]
minimum_bridge=minimum_base-assumptions["tapeMinimumSensitivityThicknessMM"]

def review(name,offset):
    x,y=cx+offset[0],cy+offset[1]
    nominal=rect(x,y,15,15)
    envelope=expand(rect(x,y,15.2,15.2),.25)
    rows=[];unknown=[];fail=[]
    for o in objects:
        b=o["bounds"];g=expand(b,.05)
        if separation(nominal,b)>3 and not overlap(envelope,g):
            continue
        hit=overlap(envelope,g)>1e-10
        h=o["bodyMaximumHeightMM"]
        low=h is not None and h+.10+.10<=minimum_base+1e-9
        if hit and h is None:
            unknown.append(o["name"])
        if hit and h is not None and not low:
            fail.append(o["name"])
        rows.append({**o,"nominalPlanarGapMM":separation(nominal,b),"tolerancePlanarGapMM":separation(envelope,g),
                     "nominalOverlapAreaMM2":overlap(nominal,b),"overlapsToleranceEnvelope":hit,
                     "clearsVerticallyIfBaseAtLeast0p8MM":low,
                     "verticalGapAtBase0p8MM":None if h is None else minimum_base-(h+.10)})
    boardbounds=rect(pcb["center"]["x"],pcb["center"]["y"],pcb["width"],pcb["height"])
    boardmargin=min(envelope["minX"]-boardbounds["minX"],boardbounds["maxX"]-envelope["maxX"],envelope["minY"]-boardbounds["minY"],boardbounds["maxY"]-envelope["maxY"])
    # Smallest heatsink width for contact coverage, largest bridge outline
    # sensitivity and independent assembly-placement sensitivities.
    bridge_contact=expand(rect(cx,cy,10,10),.05)
    contact_covered=(x-7.4+.25<=bridge_contact["minX"] and x+7.4-.25>=bridge_contact["maxX"]
                     and y-7.4+.25<=bridge_contact["minY"] and y+7.4-.25>=bridge_contact["maxY"])
    return dict(name=name,offsetFromBridgeMM=offset,centerMM=[x,y],nominalBounds=nominal,toleranceEnvelope=envelope,
                potentialTallPartCollisions=fail,unknownHeightsInsideEnvelope=unknown,boardEdgeMarginMM=boardmargin,
                nominal10mmBridgeContactCoveredWithSensitivity=bool(contact_covered),parts=rows,
                conditionalFit=not fail and not unknown and boardmargin>=0 and contact_covered)

cases=[review("Centred on bridge",[0,0]),review("Recommended offset",[2,-.1])]
assert "C_VDD_12" in cases[0]["potentialTallPartCollisions"],cases[0]["potentialTallPartCollisions"]
assert cases[1]["conditionalFit"],json.dumps(cases[1],indent=2)
assert all(p["layer"]=="top" for p in parts.values())
result=dict(dateLocal="2026-10-22",sourceFile=str(source.relative_to(ROOT)),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    scope="Board-local analytical package-envelope check. No board edits; no exact heatsink STEP model; no GPU or enclosure model.",
    bridgeCenterMM=[cx,cy],assumptions=assumptions,
    requiredMinimumHeatsinkBaseAbovePcbTopMM=minimum_base,
    requiredMinimumInstalledBridgeHeightMM=minimum_bridge,
    maximumStackAbovePcbTopSensitivityMM=.982+.15+15.2,
    recommendedExternalHeadroomMM=17,cases=cases,
    verdict="A centred flat base is obstructed by C_VDD_12. A 2.0 mm +X, 0.1 mm -Y offset fits the checked board envelopes, provided the heatsink underside is at least 0.8 mm above the PCB top.",
    limitations=["Minimum installed bridge height is not guaranteed in the available drawing. The clearance condition requires at least 0.70 mm installed bridge height with the tape-minimum sensitivity. The reference construction suggests 0.872–0.952 mm.",
                 "Heatsink dimensions and assembly tolerances are explicit assumptions. Actual fins, tabs, clips, adhesive fillets and part tolerances must stay within the specified envelope.",
                 "PCB bow, heatsink tilt and transport retention are not modeled. Keep the metal base clear of every surrounding part.",
                 "GPU coolers, backplates, support brackets and enclosure are external to this model. Reserve 17 mm above the PCB top over the proposed footprint.",
                 "Physical fit does not establish adequate cooling. Thermal load testing remains required."],
    references={"ASM2464PDX":"datasheets/ASM2464PDX_DataSheet_R0_3.pdf",**{k:v[3] for k,v in profiles.items()}},
    inputSha256={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,Path(__file__),ROOT/"datasheets/ASM2464PDX_DataSheet_R0_3.pdf",*sorted({ROOT/v[3] for v in profiles.values()})]})
(OUT/"results.json").write_text(json.dumps(result,indent=2)+"\n")

fig,axes=plt.subplots(1,2,figsize=(12,7))
for ax,c in zip(axes,cases):
    ax.add_patch(Rectangle((cx-5,cy-5),10,10,facecolor="#273c52",alpha=.9,zorder=2))
    ax.text(cx,cy,"ASM2464PDX\n10 × 10 mm",ha="center",va="center",color="white",fontsize=9,zorder=4)
    for o in objects:
        b=o["bounds"]
        if separation(c["nominalBounds"],b)>4:continue
        h=o["bodyMaximumHeightMM"]
        tall=h is None or h>.6
        color="#b33a32" if o["name"]=="C_VDD_12" else "#b37a32" if tall else "#679bad"
        ax.add_patch(Rectangle((b["minX"],b["minY"]),b["maxX"]-b["minX"],b["maxY"]-b["minY"],facecolor=color,alpha=.75,zorder=3))
        if o["name"] in ["C_VDD_12","W25Q32JVSSIQ","XCLK","C1"]:
            ax.annotate(o["name"],((b["minX"]+b["maxX"])/2,(b["minY"]+b["maxY"])/2),xytext=(0,8 if o["name"]!="C_VDD_12" else -15),textcoords="offset points",ha="center",fontsize=8)
    a=c["nominalBounds"];g=c["toleranceEnvelope"]
    ax.add_patch(Rectangle((a["minX"],a["minY"]),15,15,facecolor="#6bc58a",alpha=.12,zorder=1))
    ax.add_patch(Rectangle((a["minX"],a["minY"]),15,15,fill=False,edgecolor="#087441",lw=2,zorder=5))
    ax.add_patch(Rectangle((g["minX"],g["minY"]),g["maxX"]-g["minX"],g["maxY"]-g["minY"],fill=False,edgecolor="#087441",ls="--",lw=1,zorder=5))
    ax.set(xlim=(19.3,42.7),ylim=(81.5,111.8),xlabel="Board X (mm)",ylabel="Board Y (mm)",title=c["name"]+(" — blocked" if not c["conditionalFit"] else " — conditional fit"))
    ax.set_aspect("equal");ax.grid(alpha=.15)
    if c["offsetFromBridgeMM"]!=[0,0]:
        ax.annotate("",(c["centerMM"][0],cy+5.8),(cx,cy+5.8),arrowprops=dict(arrowstyle="<->",color="#164f78"))
        ax.text(cx+1,cy+6.1,"2.0 mm toward USB side",fontsize=8,ha="center",color="#164f78")
fig.suptitle("15 × 15 mm flat heatsink base: centred versus offset\nSolid green: nominal base; dashed green: size + placement envelope",fontsize=12)
fig.tight_layout();fig.savefig(OUT/"mounting-plan.png",dpi=180);plt.close(fig)

def esc(s):return html.escape(str(s))
def table(headers,rows):return "<table><tr>"+"".join("<th>"+esc(h)+"</th>" for h in headers)+"</tr>"+"".join("<tr>"+"".join("<td>"+esc(v)+"</td>" for v in row)+"</tr>" for row in rows)+"</table>"
critical=[]
for c in cases:
    for name in ["C_VDD_12","W25Q32JVSSIQ","XCLK"]:
        p=next(p for p in c["parts"] if p["name"]==name)
        critical.append([c["name"],name,f"{p['bodyMaximumHeightMM']:.2f} mm",f"{p['nominalPlanarGapMM']:.3f} mm",f"{p['tolerancePlanarGapMM']:.3f} mm",f"{p['nominalOverlapAreaMM2']:.3f} mm²"])
small=[p for p in cases[1]["parts"] if p["overlapsToleranceEnvelope"]]
report=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bridge heatsink fit</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;background:#f5f7fa;color:#183244;margin:0}}main{{max-width:1100px;margin:auto;padding:30px 25px 70px}}h1{{line-height:1.2}}h2{{margin-top:32px}}img{{width:100%}}table{{border-collapse:collapse;background:white;width:100%;font-size:14px}}td,th{{padding:9px;border-bottom:1px solid #d7e0e7;text-align:left}}th{{background:#e5edf2}}.callout{{padding:18px 24px;background:#fff0d9;border-left:5px solid #a76918}}code{{font-size:12px;overflow-wrap:anywhere}}a{{color:#075a95}}</style><main>
<p>Mechanical fit review • 22 October 2026</p><h1>15 × 15 × 15 mm bridge heatsink</h1>
<div class="callout"><strong>Fits the checked board envelopes with an offset. A centred flat base is obstructed.</strong>
<p>Place the heatsink centre 2.0 mm toward the USB side (+X), and 0.1 mm toward the SPI flash (-Y), from the bridge centre.</p>
<p>The offset retains contact with the complete nominal 10 × 10 mm bridge top. No PCB components or copper were moved.</p></div>
<p>Bridge centre: ({cx:.4f}, {cy:.4f}) mm. Proposed heatsink centre: ({cx+2:.4f}, {cy-.1:.4f}) mm.</p>
<p>At the proposed position, the base overhangs the chip by 0.5 mm toward PCIe, 4.5 mm toward USB, 2.6 mm toward the flash, and 2.4 mm toward the crystal.</p>
<p>Use a flat base with no protruding clips or feet. Reserve <strong>17 mm above the PCB top</strong> at the proposed location.</p>
<img src="mounting-plan.png" alt="Dimensioned plan of centred and offset heatsink positions">
<h2>Why the offset matters</h2><p>A centred base overlaps the body of C_VDD_12. That capacitor is 1.25 ±0.20 mm tall before solder standoff.</p>
<p>The bridge drawing gives a maximum total height of 0.982 mm. Thin 0.125 mm tape therefore cannot guarantee clearance above this capacitor.</p>
<p>The offset moves the heatsink away from C_VDD_12. The closest tall bodies then have about 0.5 mm nominal planar clearance.</p>
{table(["Placement","Part","Maximum body height","Nominal XY gap","Gap with assumed tolerances","Nominal XY overlap"],critical)}
<h2>Parts underneath the overhang</h2><p>Several 0402 parts lie beneath the proposed overhang. Their maximum body height is 0.60 mm or less.</p>
<p>With a 0.10 mm solder-standoff allowance and 0.10 mm clearance target, the heatsink underside must be at least <strong>0.80 mm above the PCB top</strong>.</p>
<p>With the tape-minimum sensitivity of 0.10 mm, the installed bridge top must be at least <strong>0.70 mm above the PCB</strong>.</p>
<p>The bridge drawing's reference construction gives 0.872–0.952 mm. It does not specify a guaranteed minimum total height, so this remains a physical assembly condition.</p>
{table(["Part","Part number","Maximum body height","Gap at 0.80 mm heatsink underside"],[[p["name"],p["part"],f"{p['bodyMaximumHeightMM']:.2f} mm",f"{p['verticalGapAtBase0p8MM']:.2f} mm"] for p in small])}
<h2>Assembly envelope</h2><p>The check allows a maximum heatsink envelope of 15.2 × 15.2 mm, ±0.25 mm heatsink placement, and ±0.05 mm component placement.</p>
<p>These are engineering assumptions. They do not replace the selected heatsink drawing or assembler tolerances.</p>
<p>The height sensitivity is 0.982 mm bridge + 0.15 mm tape + 15.2 mm heatsink = <strong>{result['maximumStackAbovePcbTopSensitivityMM']:.3f} mm</strong> above the PCB top.</p>
<p>The 17 mm headroom recommendation adds clearance. GPU coolers, backplates and enclosure geometry are outside this board-only model.</p>
<ul>{''.join('<li>'+esc(s)+'</li>' for s in result['limitations'])}</ul>
<h2>Evidence</h2><p>The fresh source build has identical assembled component placements to dist/board.circuit.json. It contains {len(parts)} assembled parts, all on top.</p>
<p>Source SHA-256: <code>{result['sourceSha256']}</code></p><p><a href="results.json">Complete dimensions, assumptions and hashes</a></p>
<pre><code>bun scripts/build-board.mjs dist/heatsink-fit/current.circuit.json --pcb-only
python simulations/mechanical/check_heatsink_fit.py</code></pre>
<p>Dimensions come from the ASMedia bridge drawing, Samsung capacitor drawings, Uniohm 0402 family drawing, Taitien crystal drawing and Winbond SS-package drawing.</p>
<ul>{''.join('<li><a href="../../'+esc(p)+'">'+esc(p.split('/')[-1])+'</a></li>' for p in sorted(set(result['references'].values())))}</ul>
</main></html>'''
(OUT/"report.html").write_text(report)
print(json.dumps({"sourceSha256":result["sourceSha256"],"centredObstructions":cases[0]["potentialTallPartCollisions"],
                  "offsetConditionalFit":cases[1]["conditionalFit"],"offsetMM":cases[1]["offsetFromBridgeMM"],
                  "requiredMinimumBaseHeightMM":minimum_base,"stackMaximumMM":result["maximumStackAbovePcbTopSensitivityMM"]},indent=2))
