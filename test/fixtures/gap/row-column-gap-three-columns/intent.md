---
feature: gap
viewports: [600, 375]
maxDiffRatio: 0.003
expect: compile
codes: []
status: active
---
Order summary: three equal flex columns (date, number, total) separated by column-gap: 16px.
Must stay true: the 16px gutter sits exactly between column edges, the three columns share the width left after both gaps equally, and text stays left-aligned in each column.
At 375 the labels may wrap but the three columns stay in one row.
Tolerance 0.003 (measured 0.0027 at 375): fixed 16px gutters inside percentage columns shift the column edges by a few px versus flex.
