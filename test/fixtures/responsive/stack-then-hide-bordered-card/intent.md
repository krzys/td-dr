---
feature: responsive
viewports: [600, 500, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W014]
status: active
---
A bordered, rounded 40% border-box note that stacks under 520px and is hidden under 400px.
Must stay true: no E017, both screens kept; side by side the note stretches to the row; stacked, its border sits inside its 40% so it wraps where the browser wraps it; at 375 only the copy shows.
