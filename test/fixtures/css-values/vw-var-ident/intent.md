---
feature: css-values
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [I006]
status: active
---
A custom property named --space-5vw is an identifier, not a length, so it stays 20px with no diagnostic. --pad: 5vw is a real length: 30px, one I006.
