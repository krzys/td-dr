---
feature: responsive
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A plain div with a background on :hover only (visual can't hover; the golden is the assertion).
Must stay true: no E017; the div's cell carries a t- class and the head has `.t-n:hover { background-color:#eef2ff !important; }`.
