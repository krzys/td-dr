---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An img with an authored align, hspace and a CSS float: the CSS float wins and the output has one align attribute (left), not two.
