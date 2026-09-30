---
feature: padding-margin
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
Sale hero with a badge that pulls up into the blue panel using margin-top: -12px. Negative margins are out of scope: they cannot be expressed as padding.
The compiler must not clamp the value to 0 or silently drop it. Must stay true: a diagnostic is reported at the margin-top declaration with a hint that negative margins are unsupported, and no output is emitted in strict mode.
Codes are not yet assigned; the implementer proposes them.
