---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.0098 # text after the image no longer wraps beside it (W001), ~0.0090
maxDiffRatio375: 0.0155 # same, ~0.0142
expect: compile
codes: [W001]
status: active
---
A floated image alone in its paragraph: text in the next paragraph wraps beside it in a browser but not in an email (W001).
