---
feature: grid
viewports: [600, 375]
maxDiffRatio: 0.05
maxDiffRatio375: 0.1
expect: compile
codes: []
status: active
---
A grid with two ordered items and an Outlook-only item after the first (itself ordered last so the browser shows it after both). The browser shows "First by order" then "Second by order"; the Outlook-only cell travels with the item before it in the source (the one ordered second) and takes no place in the grid.
