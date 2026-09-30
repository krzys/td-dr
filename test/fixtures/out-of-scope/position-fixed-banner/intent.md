---
feature: out-of-scope
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E002]
status: active
---
Promo banner pinned to the bottom of the viewport with position: fixed. Email clients have no viewport-anchored
positioning, so this is out of scope. Must stay true: a diagnostic is reported at the position: fixed declaration with
a hint that fixed elements are unsupported, and no output is emitted in strict mode.
