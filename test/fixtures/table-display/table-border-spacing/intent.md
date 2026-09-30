---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two table-layout: fixed display: table blocks with border-spacing: 10px, one 600px wide and one 100%. Must stay true: border-spacing is inside the table's width (the 600px table measures 600px, not 620px), the 10px gaps sit between and around the cells.
