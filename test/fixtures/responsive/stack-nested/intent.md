---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A stacking row inside the column of a row that stacks too, both under 480px.
Must stay true: both rows stack (each cell a block, the 16px and 8px gaps as padding-top); no E017.
