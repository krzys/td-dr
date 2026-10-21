---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.0055 # text after the image no longer wraps beside it (W001), ~0.0047
maxDiffRatio375: 0.008 # same, ~0.0072
expect: compile
codes: [W001]
status: active
---
A floated image in loose text of a container, followed by a paragraph: the loose text is its own cell, so wrapping stops there (W001).
