---
feature: css-values
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [I006]
status: active
---
width: 80vw is a fixed 480px at the 600px design width, and 100vw is 600px (I006 for each). The table stays that wide on
a phone and overflows there, which is what the info diagnostic warns about; only the 600px viewport is compared.
