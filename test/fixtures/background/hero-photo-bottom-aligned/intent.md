---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Hero whose headline sits at the bottom through justify-content: flex-end inside a min-height, over a photo.
Must stay true: the photo and the minimum height are kept and the headline sits at the bottom of the box, as in the
source (a table as tall as the cell with a spacer row taking the spare height, docs/support.md#height-and-vertical-distribution).
