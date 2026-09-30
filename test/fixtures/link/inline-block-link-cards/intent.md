---
feature: link
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two inline-block links, each around a padded box, side by side on one line.
Must stay true: they stay on one line (they ride in the text run like any inline-block), not stacked as two link boxes.
