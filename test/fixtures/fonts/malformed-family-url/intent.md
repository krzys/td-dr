---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I008]
status: active
---
A stray % in a font URL does not crash decoding; the link is kept as written and the family is still found.
