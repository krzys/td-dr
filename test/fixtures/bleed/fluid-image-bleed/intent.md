---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
A fluid image (max-width:100%) with margin: 0 -24px. The browser shifts it left rather than widening it, so the bleed is not lowered: E005.
