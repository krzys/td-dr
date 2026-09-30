---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
maxDiffRatio375: 0.003
---
Rounded, tinted cards stretched to equal height inside a padded row: corners and backgrounds must survive (separate borders).
375px tolerance 0.003: the 12px gutters keep their width on a phone (they are padded cells), like the flex gaps, and auto
layout takes that from the cards by content, so they end up 1-2px apart.
