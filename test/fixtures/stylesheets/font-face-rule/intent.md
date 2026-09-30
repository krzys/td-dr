---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I008]
status: active
---
An author @font-face rule. It is kept in the head (I008) and the fallback stack (Georgia) is used where the font does not load.
Must stay true: the text keeps its font-family stack and the layout does not change.
