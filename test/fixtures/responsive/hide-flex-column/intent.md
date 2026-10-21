---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A two-column flex row whose right column is display:none under 480px.
Must stay true: both column cells keep width 50% in the base; the right column keeps its cell and width when hidden, its content sits in a hide cell of its own (no W003: it is the last column).
