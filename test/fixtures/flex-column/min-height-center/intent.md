---
feature: flex-column
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A 320px min-height painted column with three items and justify-content: center.
Must stay true: the items sit where center puts them in the spare height, at both widths
(docs/layout.md#vertical-distribution-inside-a-min-height).
