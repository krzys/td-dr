---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
maxDiffRatio375: 0.008
---
A flex:1 card with side margins next to a taller sibling: margins don't flex, both backgrounds reach the row's full height.
375px tolerance 0.008: the gutters keep their 10px on a phone; what is left is the percent columns rounding differently from flex.
