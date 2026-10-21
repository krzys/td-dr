---
feature: grid
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.004 # the gutters are % of the row, so they shrink below 600px, ~0.0027
expect: compile
codes: []
status: active
---
Five items in two columns. Must stay true: the last row has one cell that is exactly as wide as the cells above
it (not stretched across the grid), and an empty slot to its right.
