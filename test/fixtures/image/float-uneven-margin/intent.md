---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
Floated image with margin on the right and bottom only. hspace/vspace apply to both sides, so the margin can't be mapped: it stays as CSS margin and W005 says Outlook loses it.
