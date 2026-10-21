---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A wrapping row of three 200px items, the middle one hidden under 480px.
Must stay true: the hidden item leaves no empty box that changes the wrapping at 375.
