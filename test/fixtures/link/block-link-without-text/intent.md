---
feature: link
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
A link around a painted banner box with nothing inside it.
Must stay true: the box is drawn; there is no text or image to carry the link, so it is dropped with a W001 (not an info).
