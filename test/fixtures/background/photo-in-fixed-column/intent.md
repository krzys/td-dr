---
feature: background
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A photo with a min-height in a fixed 200px column of a row: the VML rect takes its width from the column's resolved
width (200px), not the row's.
