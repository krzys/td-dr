---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A link around an image where the link has a background colour and border-radius and the image has neither.
Must stay true: the paint moves onto the image box, so the 200x100 image shows the 8px rounded corners and background, and stays clickable.
