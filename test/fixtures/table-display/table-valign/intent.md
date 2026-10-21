---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three table cells of different heights with vertical-align top, middle and bottom. Must stay true: the short text sits at the top, the
middle and the bottom of the tallest cell, and every cell's background fills the row height.
