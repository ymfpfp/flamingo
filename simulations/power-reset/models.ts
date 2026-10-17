/** TPS389001 approximation, not a TI model. See README.md for scope and omissions. */
export const supervisorModel = `
.subckt FLAMINGO_TPS389001 VDD SENSE N_MR N_RESET CT GND
VONE ONE GND 1
RSTATE ONE BAD 1k
SSTATE BAD GND SENSE GND SENSE_SW
.model SENSE_SW SW(Ron=0.01 Roff=1e12 Vt=1.1535 Vh=0.0035)
BGOOD TARGET GND V=1-V(BAD,GND)
RTIMER TARGET TIMER 1k
CTIMER TIMER GND 36.067n
SDIS TIMER GND BAD GND LOGIC_SW
.model LOGIC_SW SW(Ron=0.01 Roff=1e12 Vt=0.5 Vh=0)
BREADY READY GND V=V(TIMER,GND)*(V(VDD,GND)>1.5)*(V(N_MR,GND)>0.7*V(VDD,GND))
SRESET N_RESET GND GND READY RESET_SW
.model RESET_SW SW(Ron=10 Roff=1e12 Vt=-0.5 Vh=0)
RCT CT GND 1e12
.ends FLAMINGO_TPS389001
`;

export type Point = readonly [timeMs: number, voltage: number];
export function waveformModel(points: readonly Point[], name = "FLAMINGO_WAVE") {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error("Invalid waveform model name.");
  for (let i = 0; i < points.length; i++) {
    if (!Number.isFinite(points[i][0]) || !Number.isFinite(points[i][1]) ||
        points[i][0] < 0 || (i > 0 && points[i][0] <= points[i - 1][0])) {
      throw new Error("Waveform points must be finite and have increasing, nonnegative times.");
    }
  }
  if (points.length < 2 || points[0][0] !== 0) throw new Error("Waveforms must start at zero and contain at least two points.");
  return `.subckt ${name} OUT GND
VSTIM OUT GND PWL(${points.map(([ms, volts]) => `${ms / 1000} ${volts}`).join(" ")})
.ends ${name}`;
}
