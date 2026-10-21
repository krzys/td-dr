---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A 200px image column beside a flex:1 text column, the image align-self: center, stacking under 480px.
Must stay true: the stacked image column keeps its 200px as max-width and is centered by auto margins (align-self: center); the text column fills the width. No E017.
