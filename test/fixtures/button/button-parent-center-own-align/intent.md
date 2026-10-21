---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Inline-block button that sets text-align: center on itself, inside a parent with text-align: center.
Must stay true: the button is horizontally centered (a browser places an inline-block by its parent's text-align,
not its own). The only diagnostic is the radius W003 for the estimated Outlook size.
