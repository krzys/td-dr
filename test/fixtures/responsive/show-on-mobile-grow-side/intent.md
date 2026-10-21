---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A flex:1 column beside a 100px column that is hidden in the base and shown under 480px. Must stay true: at 600 the main column takes the whole row (gutter cells hidden too); at 375 both columns show with the 16px gap.
