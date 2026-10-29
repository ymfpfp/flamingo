import type {ComponentProps} from "react";
import {X1618WVS_164_9TV30} from "./X1618WVS_164_9TV30";

// XKB drawing X-X1618WVS-XX-9TV15, rev A0: common 164-pin geometry.
// V15 uses 15 microinch contact gold; V30 uses 30 microinch gold.
export const X1618WVS_164_9TV15 = (props: ComponentProps<typeof X1618WVS_164_9TV30>) => (
  <X1618WVS_164_9TV30 {...props}
    manufacturerPartNumber="X1618WVS-164-9TV15"
    supplierPartNumbers={{jlcpcb: ["C21263100"]}}
  />
);
