---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A rounded button with a 220px border-box width and a 2px border.
Must stay true: the outer box is 220px wide including the border. In Outlook the VML shape is 220px wide and its stroke is 2px in the border colour; no size diagnostic because the width is known.
