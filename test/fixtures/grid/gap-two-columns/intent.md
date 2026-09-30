---
feature: grid
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.004 # the gutters are % of the row, so they shrink below 600px, ~0.003
expect: compile
codes: []
status: active
---
Merch 2x2 grid using display: grid with gap: 16px. Must stay true: the gap is kept both between columns and
between rows, the grid's own 16px padding and white background surround the cells, and the four gray cells
are equal width. At 375px the grid stays two columns.
