---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
A band with width:100% and margin: 0 -24px. With a percentage width CSS ignores margin-right, so the box only shifts left; widening it would misrender, so E005 with a width:auto hint.
