---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A full-width display: table whose cells set widths: 120px, 25% and a cell with none. Must stay true: the first cell is 120px, the second a
quarter of the row, the last takes what is left, and the cells keep their padding.
