---
feature: stylesheets
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A later rule with content: none on a modifier class beats the earlier string, as in the cascade. The .h paragraph gets no
pseudo text and no warning; the plain .b paragraph still gets "X".
