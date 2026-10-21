---
feature: out-of-scope
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E003]
status: active
---
Diagonal ribbon rotated with transform: rotate(-12deg). Transforms are not supported by most email clients and are out of
scope. Must stay true: a diagnostic is reported at the transform declaration with a hint to use an image or a
non-rotated element instead, and no output is emitted in strict mode.
