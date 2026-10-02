---
feature: css-values
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [I006]
status: active
---
clamp() with a viewport middle value. At the 600px design width clamp(16px, 4vw, 24px) is 24px, clamp(12px, 1.5vw, 20px)
is 12px, and calc(2vw + 4px) is 16px. Each distinct vw value is reported once as I006; no E006.
