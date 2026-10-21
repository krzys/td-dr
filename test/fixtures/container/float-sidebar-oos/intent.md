---
feature: container
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E004]
status: active
---
Centered 600px container with a floated 160px promo sidebar beside the main paragraph.
Float-based sidebars are out of scope for the container lowering, so the compiler must emit a diagnostic with a location and hint.
Codes are not yet assigned; the implementer proposes them.
