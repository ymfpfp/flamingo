import type {AnyCircuitElement} from "tscircuit";
export function electricalMargins(json:AnyCircuitElement[]):{
  converter:Array<{
    rail:string;part:string;nominalV:number;minimumV:number|null;maximumV:number|null;
    staticVoltageRangePass:boolean;datasheetLcSelectionPass:boolean;
    remainingLowerMarginMV:number|null;remainingUpperMarginMV:number|null;
    continuousLoadEnvelopeA:number;nominalSwitchingFrequencyHz:number|null;
    [key:string]:unknown;
  }>;
  [key:string]:unknown;
};
