import type { InductorProps } from "@tscircuit/props"

// Sunltech SLW-S Rev.03, pp.2,9: 5 x 5 x 4 mm, +/-20%, DCR 17 mOhm +/-30%.
// Irms = 3.95 A at 40 C rise from 20 C; Isat = 6.5 A at 30% inductance loss.
export const SLW5040S2R2MST = (props: Omit<InductorProps, "inductance">) => {
  return (
    <inductor
      inductance="2.2uH"
      maxCurrentRating="3.95A"
      datasheetUrl="https://datasheet.lcsc.com/datasheet/pdf/3b3c132b337466bfe3bc78dcabb85adb.pdf?productCode=C206346"
      supplierPartNumbers={{
  "jlcpcb": [
    "C206346"
  ]
}}
      manufacturerPartNumber="SLW5040S2R2MST"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="1.999996mm" pcbY="0mm" width="2.1239988mm" height="4.2200068mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="-1.999996mm" pcbY="0mm" width="2.1239988mm" height="4.2200068mm" shape="rect" />
<silkscreenpath route={[{"x":-2.5262078000000656,"y":2.2624034000000393},{"x":-2.5262078000000656,"y":2.5262078000000656},{"x":2.526207799999952,"y":2.5262078000000656},{"x":2.526207799999952,"y":2.2624034000000393}]} />
<silkscreenpath route={[{"x":-2.5262078000000656,"y":-2.2624033999999256},{"x":-2.5262078000000656,"y":-2.5262078000000656},{"x":2.526207799999952,"y":-2.5262078000000656},{"x":2.526207799999952,"y":-2.2624033999999256}]} />
<silkscreentext text="{NAME}" pcbX="-0.0127mm" pcbY="3.54mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-3.3119954000000007,"y":2.7499950000001263},{"x":3.311995399999887,"y":2.7499950000001263},{"x":3.311995399999887,"y":-2.7499950000000126},{"x":-3.3119954000000007,"y":-2.7499950000000126},{"x":-3.3119954000000007,"y":2.7499950000001263}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C206346.obj?uuid=0acce46b82494539a4589a0e8b12d880",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C206346.step?uuid=0acce46b82494539a4589a0e8b12d880",
        pcbRotationOffset: 90,
        modelOriginPosition: { x: 0, y: 0, z: -0.01 },
      }}
      {...props}
    />
  )
}
