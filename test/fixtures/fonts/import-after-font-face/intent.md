---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001, I008]
status: active
---
@font-face before a font @import in one style: the import is dropped with W001, the face is kept.
