---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A 2-track grid with a row-gap that becomes display:block under 480px.
Must stay true: no E017. Block layout has no gap, so the stacked blocks have none either (the grid's gap padding goes to 0 on the phone), as in the source.
