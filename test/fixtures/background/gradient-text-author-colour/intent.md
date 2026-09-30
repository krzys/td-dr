---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
Gradient text with an opaque authored `color` as the progressive-enhancement fallback: the author's #2f3cff is kept,
not the gradient's first stop (#e86bb8). W001 reports the solid colour.
