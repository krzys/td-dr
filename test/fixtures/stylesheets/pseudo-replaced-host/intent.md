---
feature: stylesheets
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Browsers draw no ::before/::after on replaced or foreign elements (svg, img, canvas), so nothing is inserted and the svg markup is unchanged.
