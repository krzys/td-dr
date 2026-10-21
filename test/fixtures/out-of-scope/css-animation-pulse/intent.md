---
feature: out-of-scope
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E009]
status: active
---
Call-to-action button with a looping @keyframes pulse animation. CSS animations are not supported in email clients and
are out of scope. Must stay true: a diagnostic is reported at the animation declaration with a hint that animations are
unsupported, and the static button is not silently emitted without the animation in strict mode.
