---
feature: responsive
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A flex:0 0 120px image column beside a flex:1 text column, stacked under 480px.
Must stay true: a flex-basis is a height in a column (dropped, W003), so the stacked image cell is full width with no 120px max-width. Visual check at 600 only: the 375 render differs by the basis height.
