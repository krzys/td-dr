---
feature: responsive
viewports: [600, 520, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Painted side columns that drop their fill under 560px and go under 480px: one beside a column that grows, one in a row of fixed widths.
Must stay true: no E017, both screens kept; at 520 the side columns show unpainted; at 375 they are gone (the first row's copy takes the width, the second row keeps its 60% column).
