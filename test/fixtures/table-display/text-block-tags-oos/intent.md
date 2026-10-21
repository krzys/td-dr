---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E001]
status: active
---
ul and h1 are text blocks, not layout containers: display: table on them is out of scope (E001), not a centering table.
