---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A display: table with table-layout: fixed and three table-cell children, no widths. Must stay true: the three cells are equal thirds at
600px and 375px, each keeps its 12px padding and background, and nothing wraps differently from the source.
