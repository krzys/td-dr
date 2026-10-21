---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.02
maxDiffRatio375: 0.02
expect: compile
codes: [W003]
status: active
---
Two adjacent bordered cells in the default border-collapse: separate. The browser draws the seam twice (2px), the email once (1px), so td;dr warns. The diff is loose on purpose: it measures that one pixel.
