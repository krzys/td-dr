---
feature: flex-row
viewports: [600]
maxDiffRatio: 0.005 # measured 0.0036: the W003: the table splits the leftover by content, not 2:1
expect: compile
codes: [W003]
status: active
---
flex: 2 and flex: 1 columns beside a 100px column. One auto-layout table can't honour the 2:1 split beside a px
column, so the grow columns share the space by their content.
Must stay true: the W003 says so; the px column keeps 100px.
