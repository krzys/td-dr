---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A wrapping row inside the grow column of a non-wrapping row (nested ghost tables inside an outer cell).
Must stay true: at 600px the 400px column holds A and B on line 1 and C on line 2 beside the 200px sidebar.
