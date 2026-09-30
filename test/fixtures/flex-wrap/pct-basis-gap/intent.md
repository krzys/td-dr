---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Two flex:0 0 48% columns with a 12px gap.
Must stay true: side by side at 600px with a 12px gap, and still side by side at 375px (the % columns are % inline-blocks that keep
their share of the line). The W003s are the trailing row gap and the ragged painted heights, not the percentage.
