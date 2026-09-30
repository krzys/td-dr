---
feature: out-of-scope
expect: compile
codes: [W010]
maxDiffRatio: 0.004 # the svg sits on a line of its own in the output, ~0.0035
viewports: [600, 375]
allowSvg: true
status: active
---
Inline <svg> with the allowSvg option: the markup is kept and W010 warns who won't show it.
