---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A text column that grows, beside a 160px rounded call-to-action, vertically centered.
Must stay true: the button keeps its 160px width (and Outlook's VML shape is 160px wide), the label is centered in it,
and the text takes the rest of the row and wraps at 375px.
