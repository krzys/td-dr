---
feature: responsive
viewports: [600, 500, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Bordered painted columns that stack under 520px: a 40% border-box note beside the copy, and two growing rounded cards with a border all round.
Must stay true: stacked, each card's border sits inside its width (the note is 40% of the line, the cards are the whole line and don't overflow it), so the note wraps where the browser wraps it; side by side the cards stretch to the row.
