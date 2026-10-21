---
feature: flex-column
template: handlebars
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E007]
status: active
---
A column with an ordered item and an if / else chain whose branches carry an order. The chain's place can't be known at compile time. Must stay true: E007 at the ordered branch, never a silently wrong order.
