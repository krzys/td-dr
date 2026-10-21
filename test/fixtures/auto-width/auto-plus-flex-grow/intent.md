---
feature: auto-width
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Receipt line items: an auto-width quantity pill on the left and a flex:1 product name filling the rest of the row.
Must stay true: the pill hugs its text and is not stretched, the name starts 12px after the pill, and the long name
wraps inside its own box at 375px without pushing the pill out of place. Rows are vertically centered with a 1px divider.
