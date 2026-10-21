---
feature: grid
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A two-column grid whose items are written four, two, one, three with orders 3, 1, 0, 2. Must stay true: the cells fill in the order
one, two, three, four across two rows, with 16px gaps.
