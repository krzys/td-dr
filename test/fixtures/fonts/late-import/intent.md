---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
A font @import after a style rule is ignored by browsers: W001, nothing emitted for it, no I008.
