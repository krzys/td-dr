---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A title and a lead paragraph whose font-size and line-height both drop under 480px.
Must stay true: one class per distinct declaration set (the two blocks differ), each with both declarations; the
inline desktop sizes stay on the cells.
