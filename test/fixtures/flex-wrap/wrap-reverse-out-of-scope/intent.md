---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E007]
status: active
---
Checkout steps in a row with flex-wrap: wrap-reverse. Reversed wrap order has no email-safe equivalent, so this
must produce a diagnostic with the source location of the wrap-reverse declaration and a hint to use flex-wrap: wrap.
Must stay true: no output is emitted for this input in strict mode.
