---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
A band with margin: 0 -10px inside a 24px-padded parent. The negative margin does not cancel the padding, so
it is a partial bleed and stays out of scope: E005 at the band, with a hint.
