---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
One flex:1 painted card next to two auto cards with a 6px gap: the row has leftover width, so the px gutters must stay 6px and not take a share of it.
