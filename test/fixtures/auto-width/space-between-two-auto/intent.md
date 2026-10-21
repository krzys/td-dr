---
feature: auto-width
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Totals block: each row has two auto-width children with justify-content: space-between, so labels sit at the left
edge and amounts at the right edge of the 20px padded box. Must stay true: the amounts end flush at the right padding
on every row, the grand total row has a 1px top border and bolder, larger type, and rows keep their baseline alignment.
