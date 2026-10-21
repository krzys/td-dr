---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Two `flex: 0 0 calc(50% - 10px); max-width: 200px` items in a wrapping row with `gap: 20px` and `padding: 0 10px`.
Must stay true: each item is 200px at 600px and, at 375px, calc(50% - 10px) = 167.5px wide, so the capped column keeps its share including the gutters (width:50%) beside max-width:200px.
