---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Order line table built from flex rows with 30% / 40% / 30% cell widths and an 8px horizontal padding on the middle cell.
Must stay true: the three columns stay aligned across the header and both item rows, the price is right-aligned,
and the long unbroken word in the description ("Monogrammed-leather-passport-holder-navy") does not push the price column
out of its 30% width at 375px.
