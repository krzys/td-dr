---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
flex: 0 0 300px; max-width: 200px beside 300px and 100px items in a 600px wrapping row.
Must stay true: the first item's basis is clamped to 200px, so all three share one 600px line as in the browser (200 + 300 + 100), not 300 + 300 | 100.
