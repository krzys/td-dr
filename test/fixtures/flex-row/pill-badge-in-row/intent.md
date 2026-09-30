---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A date on the left and a pill badge (a plain <span> flex item) on the right, from the Cartwell invoice.
Must stay true: the badge shrink-wraps its text at the right edge instead of stretching across its column.
