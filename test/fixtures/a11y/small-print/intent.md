---
feature: a11y
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I013]
status: active
---
Body text, 12px text, 10px legal text and a 1px spacer cell.
Must stay true: one I013 for the 10px text; the spacer and the 12px text are not flagged.
