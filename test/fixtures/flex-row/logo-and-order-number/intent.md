---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Header row: 120px logo on the left, order number on the right, both vertically centered in a 32px band.
The 1px bottom border spans the full width. Must stay true: logo at 24px left padding, order number at 24px right padding,
order number stays on one line at 375px, and the row keeps its height when the label and number are different sizes.
