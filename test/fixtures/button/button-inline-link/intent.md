---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Plain <a> styled as a button: 24px horizontal and 12px vertical padding, blue background, 6px radius, display inline-block.
Must stay true: the link keeps its padding box, background and rounded corners in both viewports, and the text is vertically centered inside it.
The paragraph above stays left-aligned at 24px inset from the block edge.
