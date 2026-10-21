---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Four fixed-width items with orders 0, 1, -1, 1. Must stay true: the visual order is C, A, B, D (negative first, ties keep
source order), with the 12px gap between neighbours.
