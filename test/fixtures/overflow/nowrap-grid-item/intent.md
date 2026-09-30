---
feature: overflow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I003, W003]
status: active
---
The same clipped item as a cell of a two-column grid (100px columns).
Must stay true: the clip is emitted for the grid cell, so the cell stays 100px wide whatever its line length; W003 for Outlook.
