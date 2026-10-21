---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two items written in the wrong order: the label has order 2, the message order 1. Must stay true: the message comes first and
fills the row, the 120px label sits at the right, the 16px gap is between them, at both widths.
