---
feature: link
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
A link marked `data-email="button"` (with an id) whose label is a small flex row of text and an arrow.
Must stay true: the author's hint wins: it is a bulletproof button, not a link box. The id is dropped with W001
(ButtonNode.attrs is pending), and nothing in the output carries `data-email`.
