---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Receipt summary: a column of three rows, each a space-between flex row. The first row holds a nested flex row
(16px icon + label) on its left. Must stay true: label left, amount right-aligned in every row, rows stacked
with 8px vertical padding and a divider line between them (none after the last row), icon vertically centered
with the label text.
