---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A header with the logo left and a link right (justify-content: space-between), stacked under 480px.
Must stay true: on the phone both blocks are full width and left-aligned (justify-content is vertical in a column); the right cell's text-align goes back to left.
