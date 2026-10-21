---
feature: article
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
A heading painted with a gradient over a solid background-color.
Must stay true: the heading's box moves to its cell with the solid background-color as bgcolor, and the gradient goes
on the same cell as background-image (clients without gradients show the colour). The gradient is reported as W005
for the target clients that don't paint it, not dropped silently.
