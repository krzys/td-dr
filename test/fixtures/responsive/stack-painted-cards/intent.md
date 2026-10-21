---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two painted cards (background and 16px padding) with a 16px gap that stack under 480px.
Must stay true: the stacked cards keep their padding and paint; the gutter cell between them is hidden and the 16px gap sits above the second card as a margin (padding would paint). No E017.
