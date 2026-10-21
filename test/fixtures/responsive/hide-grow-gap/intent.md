---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two flex:1 painted items with gap 16px, the second hidden under 480px.
Must stay true: no gutter is left at 375, the remaining item fills the row.
