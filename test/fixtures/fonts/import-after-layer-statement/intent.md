---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I008]
status: active
---
A bodiless @layer statement before a font @import is valid CSS; the import is kept.
