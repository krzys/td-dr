---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A row with align-items: center that becomes display:block under 480px.
Must stay true: block layout ignores align-items, so the 200px image column keeps max-width 200px and stays on the left (no auto margins).
