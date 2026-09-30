---
feature: padding-margin
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Shipping notice: outer panel with padding: 24px (one value, all sides) and an inner notice with padding: 12px 20px (vertical, horizontal).
Must stay true: the panel's 24px inset applies to all four sides, the notice has 12px top/bottom and 20px left/right, and the notice background stops at its padding box.
