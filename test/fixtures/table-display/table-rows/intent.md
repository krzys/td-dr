---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A display: table with two table-row children of two cells each; the first cell of the first row sets 160px. Must stay true: both rows
share the 160px first column, the rows sit directly under each other and the cell paint matches the source.
