---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A band with width:300px and margin: 0 -24px. The width is over-constrained, so the band shifts to the card's left edge and stays 300px wide; the output matches.
