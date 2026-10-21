---
feature: grid
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
The Velra feedback email's 2x2 points: a 380px centered block, grid-template-columns 1fr 1fr, gap 24px 32px, each
point topped by a 1px rule. Must stay true: two equal columns with a 32px gutter, a 24px gap between the rows,
the top rules span each column's full width and stop at the gutter, and the grid stays two columns at 375px.
