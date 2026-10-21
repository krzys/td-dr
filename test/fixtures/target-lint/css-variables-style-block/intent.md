---
feature: target-lint
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I003]
status: active
---
Newsletter header and footer whose colours come from custom properties declared on :root. Email clients do not resolve
CSS variables, so the compiler must not guess values. Must stay true: a diagnostic is reported at each var() use
with a hint to inline the colour value, and no output is emitted in strict mode.

