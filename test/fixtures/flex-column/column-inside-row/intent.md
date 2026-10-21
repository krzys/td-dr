---
feature: flex-column
viewports: [600, 375]
maxDiffRatio: 0.003
expect: compile
codes: []
status: active
---
Order line: a 96px image, a column of three text lines (flex: 1, 4px gap) and a fixed 80px right-aligned price, in one row
with top alignment and 16px gaps. Must stay true: the three text lines stack vertically with 4px gaps, the price stays
right-aligned at the row's right padding, and at 375px the detail column shrinks without pushing the price out of the row.
Tolerance 0.003 (measured 0.0024 at 375): the content-sized image column and the fixed price column shrink slightly differently in table layout than in flex.
