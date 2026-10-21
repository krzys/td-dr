---
feature: grid
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.012 # the gutters are % of the row, so they shrink below 600px (16px becomes ~9px), ~0.0093
expect: compile
codes: []
status: active
---
Two-column address and payment grid using display: grid with grid-template-columns: 1fr 1fr and a 16px gap.
Four gray cells fill two rows. Must stay true: both columns are equal width at 600px, a 16px gutter between
columns and between rows, cells in the second row line up under the first. Grids do not stack at 375px; the
columns stay side by side and the text wraps inside them.
