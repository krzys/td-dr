---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three 250px cards in a wrapping row, written three, two, one with orders 2, 1, 0. Must stay true: card one and card two share
the first line, card three wraps below, and the gaps match the source at 600px and 375px.
