"""Plot saved tscircuit/ngspice results. Requires matplotlib."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

output = Path(__file__).resolve().parent.parent / "dist" / "power-reset"
panels = [
    ("nominal", "Illustrative startup: rails settle before reset can release", (0, 130)),
    ("vdd-within-datasheet-window", "VDD meets its arrival limit but trails possible reset release", (0, 130)),
    ("vdd-brownout", "VDD brownout: reset stays high while VCCH remains present", (200, 275)),
    ("short-power-cycle", "Short power cycle: the RC retains charge (input clamps omitted)", (240, 280)),
]
colors = {"VCCH": "#64748b", "VCCL": "#2563eb", "VDD": "#059669", "ASM_RST_N": "#dc2626"}
fig, axes = plt.subplots(4, 1, figsize=(10, 11.5))
for ax, (name, title, limits) in zip(axes, panels):
    data = json.loads((output / f"{name}.waveforms.json").read_text())
    for signal, color in colors.items():
        wave = data[signal]
        ax.plot(wave["timeMs"], wave["volts"], color=color, lw=1.8,
                label="Bridge RST#" if signal == "ASM_RST_N" else signal)
    ax.axhspan(1.58, 1.86, color="#dc2626", alpha=0.07)
    ax.axhline(0.8, color="#dc2626", alpha=0.4, ls=":", lw=0.8)
    ax.set(title=title, xlim=limits, ylim=(-0.12, 3.65), xlabel="Time (ms)", ylabel="Voltage (V)")
    ax.grid(alpha=0.17)
    ax.spines[["top", "right"]].set_visible(False)
fig.suptitle("Power/reset sequencing - first SPICE checks", x=0.08, ha="left", fontsize=17, weight="bold", y=0.985)
handles, labels = axes[0].get_legend_handles_labels()
fig.legend(handles, labels, loc="upper left", bbox_to_anchor=(0.075, 0.96), ncol=4, frameon=False)
fig.text(0.08, 0.015, "Production reset R/C; prescribed supply rails; approximate supervisor.\n"
         "Red band: reset rising threshold range (1.58-1.86 V). Dotted line: guaranteed reset-low limit (0.8 V).\n"
         "These runs do not qualify the buck converters, bridge firmware, or complete board.", fontsize=9, color="#475569")
fig.tight_layout(rect=(0.02, 0.07, 0.99, 0.92), h_pad=1.7)
fig.savefig(output / "sequencing.png", dpi=160)
fig.savefig(output / "sequencing.svg")
print(output / "sequencing.png")
