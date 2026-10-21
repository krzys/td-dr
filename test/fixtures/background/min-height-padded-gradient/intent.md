---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001, W005]
status: active
---
Content-box min-height with padding: 300px of content plus 40px padding either side is 380px painted. Guards the cell-height subtraction visually.
