---
feature: fonts
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An @font-face inside a @supports that is false for email is dropped with its block: no font head, no diagnostics.
