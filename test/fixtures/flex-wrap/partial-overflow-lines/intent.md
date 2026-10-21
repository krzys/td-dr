---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.006 # no row padding to take the edge half-gap, so the full line sits 8px in
maxDiffRatio375: 0.011 # same inset on every stacked item
expect: compile
codes: [W003]
status: active
---
Three 292px items, gap 16px, no padding. Line 1 (two items) fills the row and loses 8px at each edge; the lone item on line 2 keeps its full 292px.
