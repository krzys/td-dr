---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
`background-size: 100%` is width 100% and height auto, not the shorthand reset: it must survive into the CSS, and the
VML rect uses a frame, not a tile.
