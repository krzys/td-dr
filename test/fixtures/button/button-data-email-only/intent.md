---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A plain inline link with no background, border or padding, forced into a bulletproof button by data-email="button" alone (the heuristics do not match it).
Must stay true: the text keeps its colour, size and href, and sits at the left edge under the paragraph. The result is a one-cell button table with no background and no radius, so no VML and no diagnostics.
