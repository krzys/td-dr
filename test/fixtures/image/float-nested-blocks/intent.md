---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.0055 # text after the image no longer wraps beside it (W001), ~0.0050
maxDiffRatio375: 0.0088 # same, ~0.0079
expect: compile
codes: [W001]
status: active
---
A floated in-text image in a nested block with blocks after it at two levels: one W001, not one per level.
