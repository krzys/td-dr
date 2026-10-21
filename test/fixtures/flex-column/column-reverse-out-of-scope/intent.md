---
feature: flex-column
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E007]
status: active
---
Column stack using flex-direction: column-reverse, which has no email-safe table equivalent and is out of scope.
The compiler must not silently reorder the children to a normal column. Must stay true: a diagnostic is reported at the
column-reverse declaration with a hint to use source order instead, and no output is emitted in strict mode.
