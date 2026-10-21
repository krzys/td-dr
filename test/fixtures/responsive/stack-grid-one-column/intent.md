---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A two-track grid (1fr 1fr, 16px gaps) with three items that becomes one track under 480px.
Must stay true: the grid keeps its two lines in every compile; stacked, each cell is a block with 16px above all but the first of its line, the row gap still separates the lines, and the empty cell that pads the short last line is hidden. No E017.
