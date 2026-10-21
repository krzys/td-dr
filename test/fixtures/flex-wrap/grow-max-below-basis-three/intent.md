---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Three flex: 1 1 300px; max-width: 200px items in a 600px wrapping row.
Must stay true: each hypothetical size is clamped to 200px, so all three share one 600px line as in the browser (not 2+1).
