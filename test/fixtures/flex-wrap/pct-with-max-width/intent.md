---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A lone `flex: 0 0 50%; max-width: 200px` item in a wrapping row.
Must stay true: 200px at 600px (the cap wins over 300) and 187.5px at 375px (the share wins over the cap), so the output keeps both width:50% and max-width:200px.
