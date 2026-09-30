---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three unpainted `flex: 1` columns with an 18px gap (Larch's blog row). The gutters are cell padding, so each column
carries padding in proportion to its share (12, 6+6, 12) and its % stays its exact share. Must stay true: the columns
are equal at both widths.
