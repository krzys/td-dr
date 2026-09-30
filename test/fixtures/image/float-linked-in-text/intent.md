---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.0075 # text after the image no longer wraps beside it (W001), ~0.0069
maxDiffRatio375: 0.012 # same, ~0.0109
expect: compile
codes: [W001]
status: active
---
A linked floated image in a short paragraph, followed by another paragraph: wrapping stops at the end of the first (W001).
