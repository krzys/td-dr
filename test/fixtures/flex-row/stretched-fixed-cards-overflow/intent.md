---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three fixed 180px painted cards with a 16px gap, 572px in total, wider than a phone; a fixed-width child keeps each card's min-content at its full width.
The px gutters must keep their width when the row is squeezed, and the output must overflow like the source.
