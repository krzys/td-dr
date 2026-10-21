---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.07 # at 375 the output stacks the 30% and grown columns; the source keeps them on one line (112.5 + 200 basis <= 375), ~0.0669
---
A flex: 0 0 30% column and a flex: 1 1 200px item on one line. Ghost cells add up: 180 for the % column and 420 for the grown item (600px). The W003 says grown items keep their design-width size as a cap.
