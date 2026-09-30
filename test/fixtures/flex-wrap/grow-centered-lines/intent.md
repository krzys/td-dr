---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.025 # stacked capped cells center at their grown width while the source fills the line, ~0.020
---
Three flex: 1 1 180px items with justify-content: center. Grown lines fill the row; stacked capped items center on a phone while the source fills the line (approximation).
