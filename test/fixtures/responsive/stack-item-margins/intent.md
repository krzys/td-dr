---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Items with margin: 0 8px, and items with width: 50%, stacked under 480px.
Must stay true: the stacked cells keep the 8px side inset (border-box padding) and the 50% width, as the column layout does.
