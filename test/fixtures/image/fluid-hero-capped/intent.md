---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Hero image with width="600" and style width:100%, max-width:600px, height:auto inside a fluid container.
Must stay true: the image fills the container up to 600px at 600 and scales down to the container width at 375, never exceeding 600px.
