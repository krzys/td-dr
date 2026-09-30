---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two buttons whose label sits in a plain `<div>` (component libraries do this): an inline-block one and a block one.
Must stay true: both are bulletproof buttons (the whole padded area is the link), not link boxes lowered as a
bar with only the text clickable; no I004.
