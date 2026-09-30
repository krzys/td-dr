---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A wrapping row with grow items inside a 300px container: lines are cut at 300, not 600, and the ghost tables nest in the slot.
