---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
The common CTA: a fixed-width inline-block with its own text-align: center inside a text-align: center parent.
Must stay true: the button is centered (the browser places an inline-block by its parent's text-align), so the
table gets align="center", and there are no diagnostics.
