---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.055 # the source shares one line (187 + 187) where the capped output stacks (200 + 220 > 375), the case the W003 names, ~0.052
---
Two flex: 1 1 150px items capped at 200px and 220px in a 600px wrapping row.
Must stay true: both stop at their caps (200, 220), the line stays short with the leftover 180px at its end (flex-start), and no rounding top-up widens either item.
