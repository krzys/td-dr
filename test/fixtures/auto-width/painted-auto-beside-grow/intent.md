---
feature: auto-width
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A content-sized, painted label beside a column that grows, stretched to the row's height (align-items: stretch).
Must stay true: the label keeps its text on one line (its max-content width) like the unpainted auto column beside a grow one, and its fill reaches the bottom of the row.
