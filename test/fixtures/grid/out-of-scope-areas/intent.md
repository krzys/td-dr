---
feature: grid
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E001]
status: active
---
Named grid areas (grid-template-areas, grid-area) place items out of source order and span columns; the grid
rule only auto-places one cell per item. Must stay true: E001 at the grid, with a hint to rely on source order,
and no output in strict mode.
