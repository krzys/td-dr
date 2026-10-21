---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.005
expect: compile
codes: [W003]
status: active
---
The centering trick with a max-width cap: display: table is shrink-to-fit even then (max-width only caps it), so short text and short cells stay as wide as their content and centered, not stretched to 400px.
