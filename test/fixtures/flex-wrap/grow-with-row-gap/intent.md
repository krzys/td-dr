---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.07 # stacked grown cells fill the line only up to their grown width, ~0.063
---
px-basis grow items with a 16px row gap and 12px column gap: grown widths and the bottom spacing together; ghost rows add up to the ghost table width.
