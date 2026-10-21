---
feature: background
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [W001, W005]
status: active
---
Gradient text nested inside a paragraph. It is not rewritten (serialize-styled is shared), so W001 warns that it vanishes where gradients are dropped.
