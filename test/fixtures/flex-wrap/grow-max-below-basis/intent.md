---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
flex: 1 1 300px; max-width: 200px beside flex: 1 1 300px in a 600px wrapping row.
Must stay true: the first item's basis is clamped to its 200px cap, so it gives 100px back and the sibling is 400px, as in the browser.
