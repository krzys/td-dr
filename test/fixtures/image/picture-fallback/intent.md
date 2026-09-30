---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I007]
status: active
---
A picture with media-query sources compiles as its img: the sources are dropped (one I007 info) and the img src is the image every client loads.
