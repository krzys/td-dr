---
feature: target-lint
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E002]
status: active
---
Receipt line items where one row is nudged up with position: relative and top: -6px. A relative offset cannot be
expressed in the email layout IR and is not reliably supported, so it is reported. Must stay true: the diagnostic
points at the position declaration with a hint to drop the offset or use padding, and no output is emitted in strict
mode.

