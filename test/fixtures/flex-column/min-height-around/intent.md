---
feature: flex-column
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A 320px min-height painted column with three items and justify-content: space-around.
Must stay true: the items sit where space-around puts them in the spare height, at both widths
(docs/support.md#height-and-vertical-distribution).
