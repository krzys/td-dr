---
feature: block-flow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An author-written ghost table split around a block: it can't survive being split into cells, so it's reported (W001).
