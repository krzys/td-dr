---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A painted band with a fixed height, and a smaller painted panel centred in it both ways (a rating card).
Must stay true: the band keeps its 180px (a px height is a min-height), the panel keeps its 280px instead of
filling the band, and it sits in the middle horizontally and vertically.
