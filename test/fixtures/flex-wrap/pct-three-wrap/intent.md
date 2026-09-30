---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Three flex: 0 0 40% columns with a 12px gap wrap 2+1. Ghost lines are 504 and 252 wide. The % columns keep their share of the line, so at 375px two sit side by side as in the source.
