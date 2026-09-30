---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.02
maxDiffRatio375: 0.05
expect: compile
codes: []
status: active
---
Two rows, the second with one cell fewer and painted cells. The column widths come from the first row; the missing cell is an empty one so the columns line up (the browser leaves that space unpainted).
