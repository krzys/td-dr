---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
An avatar stack where each image after the first overlaps its neighbour with margin-left: -8px. Overlap is not a
bleed (the parent has no padding to cancel), so it stays E005; the hint says to use spacing or a single
pre-composed image.
