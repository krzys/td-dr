---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Inline-block button with its own text-align: left inside a text-align: center container.
Must stay true: the button is centered by the parent's text-align (its own text-align only moves the label), with no
diagnostics.
