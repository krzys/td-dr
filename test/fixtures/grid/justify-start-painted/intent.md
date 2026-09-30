---
feature: grid
viewports: [600]
maxDiffRatio: 0.02 # measured 0.0178: the approximation the W003 reports: both boxes fill their column
expect: compile
codes: [W003]
status: active
---
justify-items: start with a painted item and a bordered item, neither sized.
Must stay true: a cell can't shrink a box to its content, so each box fills its column and one W003 per item says so
(borders count as paint, start counts as a placement).
