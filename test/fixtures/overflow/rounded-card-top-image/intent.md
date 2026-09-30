---
feature: overflow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A card with border-radius: 16px and overflow: hidden whose first child is a full-width photo, followed by a padded text block.
Must stay true: the photo has the card's 16px top corners (not the bottom ones) and overflow: hidden is not reported as dropped.
