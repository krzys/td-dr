---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.022 # stacked grown cells fill the line only up to their grown width, ~0.0212
---
Three flex: 1 1 180px items with 10px side margins: the margins do not grow. Line 1 holds two items grown to 300px each (margins included), line 2 one item grown to 600px; ghost cells are 300/300 and 600.
