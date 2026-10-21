---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Painted width:50% flex columns, the right one hidden under 480px.
Must stay true: the left column keeps 50% at 375 (the hidden column keeps its cell and width, unpainted).
