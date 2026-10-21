---
feature: radius
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A 56x56 link centred with text-align: center and line-height: 56px around a 24px icon, border-radius 28px.
Must stay true: the link is a 56px circle cell with the icon centred and square (the 28px radius sits on the cell, never on the icon); no dropped width/height warning.
