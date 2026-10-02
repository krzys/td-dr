---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Inline `font-size: 30px` plus `font-size: 5vw !important` under `max-width: 599px`. Desktop keeps 30px; the 0-599 variant sees
the live `5vw`, which responsive-core turns into a mobile rule.
