---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
A lone floated image with margin on the right only. As its own block the margin becomes cell padding, which Outlook honours, so there is no W005 (only W001: nothing wraps).
