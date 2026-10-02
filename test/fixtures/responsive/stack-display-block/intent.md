---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three flex:1 columns that become plain blocks under 480px (display: flex replaced by display: block).
Must stay true: same cells in every compile; the 480px rule turns each cell into a full-width block. A block has no gap, so nothing is added above the later columns. No E017.
