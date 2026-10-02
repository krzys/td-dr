---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I006]
status: active
---
`font-size: clamp(20px, 6vw, 32px)` with no media query of its own. Desktop gets 32px (6vw is 36px at 600, clamped); the
0-599 variant keeps the clamp() expression, so phones that read media queries scale it. I006 is reported once for the
6vw.
