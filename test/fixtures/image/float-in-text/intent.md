---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An image floated left inside a paragraph, with equal margins. Text wraps around it in every client: the img gets align="left", hspace and vspace (Outlook ignores image margin) next to the CSS float and margin.
