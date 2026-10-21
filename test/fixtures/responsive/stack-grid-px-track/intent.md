---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A grid of a 200px track and a 1fr track that becomes one 1fr track under 480px.
Must stay true: both stacked cells are full width (a track is not an item width, so no max-width).
