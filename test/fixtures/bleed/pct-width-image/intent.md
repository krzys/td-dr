---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
An image with width:100% and margin: 0 -24px. The browser shifts it left instead of widening it, so the bleed is not lowered: E005.
