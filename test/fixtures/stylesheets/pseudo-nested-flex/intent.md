---
feature: stylesheets
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A nested &::before inserts text like the flat form. On a display:flex container the inserted span becomes a flex item,
a column of its own before the children.
