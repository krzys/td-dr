---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.24 # the `picture img` rule stops matching once the picture is unwrapped (W001), so the hero keeps its natural size, ~0.225
expect: compile
codes: [I007, W001]
status: active
---
A selector that goes through the picture (`picture img`) stops matching once it is unwrapped. W001 names the selector instead of letting the hero silently keep its natural size.
