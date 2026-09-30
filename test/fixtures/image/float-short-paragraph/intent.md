---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.008 # text after the short paragraph no longer wraps beside the image (W001), ~0.0068
maxDiffRatio375: 0.012 # same, ~0.0108
expect: compile
codes: [W001]
status: active
---
A floated image taller than its paragraph, followed by another paragraph: wrapping stops at the end of the first (W001).
