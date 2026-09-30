---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I008]
status: active
---
@font-face inside @layer and inside @supports. Both are kept in the head (I008).
