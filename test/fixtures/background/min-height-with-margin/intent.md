---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A min-height box with a bottom margin, followed by a sibling: the 40px margin must stay outside the 320px box.
Needs margin-to-padding to leave a min-height box alone (shared-file request); until then the margin is folded into
padding and cellHeight subtracts it, so the box ends up 320px total instead of 360px with the margin. Activate once
the shared change lands.
