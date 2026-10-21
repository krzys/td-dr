---
feature: article
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A small inline-block badge above a paragraph, in text with a unitless line-height (1.5).
The cell goes out with its line-height in px, which the badge would inherit as is, 24px instead of its own 16.5px.
Must stay true: the badge states its own px line-height, so it is as tall as in the browser and the paragraph
below starts at the same height; it gets no mso-line-height-rule, since Word takes the badge as a run.
