---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A flex: 1 1 200px item next to an auto-width item in a wrapping row. In the source the grow item takes the leftover; the compiler cannot (the auto item's width is the table's to decide), so the grow is dropped and a W003 says so, besides the auto-width W003.
