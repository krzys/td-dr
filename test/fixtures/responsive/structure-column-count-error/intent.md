---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E017]
status: active
---
A 3-column grid that has 2 columns under 480px.
Must stay true: E017 for the max-width 480px rules (the column count changes); that variant is dropped.
