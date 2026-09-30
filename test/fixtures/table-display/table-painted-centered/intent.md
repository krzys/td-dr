---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A painted display: table with margin: 0 auto, table-cell children and no width. Must stay true: the blue box shrinks to its cells and is centered, not stretched to the row.
