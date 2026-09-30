---
feature: stylesheets
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
ul::before text can't sit inside the list (invalid HTML), so it is skipped with W001; li::before is inserted inside each item.
