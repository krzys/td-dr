---
feature: flex-wrap
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Two `flex: 0 0 calc(25% + 90px)` items with `gap: 20px` and side padding 10px.
Must stay true: they share a line at 600px. The source stacks them below about 400px, the output keeps them side by side, and the W003 says so.
