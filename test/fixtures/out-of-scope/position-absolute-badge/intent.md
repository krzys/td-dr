---
feature: out-of-scope
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E002]
status: active
---
Product card with a SALE badge pinned to the top-right corner via position: absolute. Absolute positioning removes the
element from flow and is out of scope. Must stay true: a diagnostic is reported at the position: absolute declaration
with a hint to restructure the badge as a normal flow element, and no output is emitted in strict mode.
