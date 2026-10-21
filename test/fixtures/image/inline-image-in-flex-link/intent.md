---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Social icons as `<a><img></a>` flex items: each link is blockified, but its image is inline inside it, so the
link's text line leaves the usual few px under the icon (Linnet's footer).
Must stay true: the icon row is as tall as in the source, so the text below sits at the same height.
