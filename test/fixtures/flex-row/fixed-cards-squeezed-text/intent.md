---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three flex:0 0 180px painted cards with wrapping text and no fixed-width child. The source keeps 180px per card (572px total, overflowing a phone). Must stay true: the cells keep 180px (a min-width, since a cell's width gives way to the text beside it).
