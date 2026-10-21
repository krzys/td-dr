---
feature: overflow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A grey tile with border-radius: 8px and overflow: hidden whose only child is a full-width photo.
Must stay true: the photo's top and bottom corners are rounded like the tile (the clipping is the radius), and overflow: hidden is not reported as dropped.
