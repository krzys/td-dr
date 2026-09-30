---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Three gap-free flex: 0 0 33.3333% columns in a 600px wrapping row.
Must stay true: the authored percentage is what comes out (33.33%, not a share rebuilt from floored pixels), the three share one line
and fill it to the last pixel, and Outlook's ghost cells add up to the ghost table width (200 each).
