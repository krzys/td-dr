---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
background-clip: text with an opaque colour: the text stays #111111 and the gradient must not become a painted box
behind it (low contrast in Outlook).
