---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.004 # no row padding to take the edge half-gap, so the line sits 10px in, ~0.0033
maxDiffRatio375: 0.004 # same inset, ~0.0036
expect: compile
codes: [W003]
status: active
---
Two flex: 0 0 49% border-box items with a 20px gap and no row padding. The source wraps them at 600 (294 + 20 + 294 > 600). Both must stay on their own lines (the gap shortfall is only taken from a line that would outgrow the row).
