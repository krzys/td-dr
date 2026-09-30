---
feature: grid
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A painted item with width: 120px in a 1fr track keeps its 120px and sits at the start of its cell, as in CSS.
Its background cannot stretch to the taller neighbour, which is the W003.
