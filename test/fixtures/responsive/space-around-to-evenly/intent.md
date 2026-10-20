---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A 320px min-height column with three items, justify-content: space-around, switched to space-evenly under 480px.
Must stay true: the screen is kept (no E017) and the items sit where each value puts them, at both widths (docs/support.md#height-and-vertical-distribution).
