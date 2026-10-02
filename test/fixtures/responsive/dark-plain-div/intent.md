---
feature: responsive
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A plain div with a background only in dark mode (visual can't show dark; the golden is the assertion).
Must stay true: no E017; the div's cell carries a t- class with background-color and color under
prefers-color-scheme: dark and the [data-ogsb] / [data-ogsc] mirrors.
