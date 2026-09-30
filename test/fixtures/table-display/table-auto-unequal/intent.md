---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.1
maxDiffRatio375: 0.2
expect: compile
codes: [W003]
status: active
---
A full-width display: table in the default table-layout with one tiny cell and one long one. Documents the equal-split choice: the browser sizes the columns by content, td;dr splits them equally; a diff here means the choice is visible.
Known gap, loose on purpose: the visual diff measures the difference between content-sized and equal columns.
