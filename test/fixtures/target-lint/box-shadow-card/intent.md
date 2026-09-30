---
feature: target-lint
viewports: [600, 375]
maxDiffRatio: 0.006 # the dropped shadow is the whole diff (~0.005)
expect: compile
codes: [W001]
status: active
---
Order confirmation card with a soft box-shadow on a bordered white panel. Box shadows are dropped by several clients,
so this compiles with a warning rather than failing. Must stay true: the card, border, padding and text compile as
normal, and a warning is reported at the box-shadow declaration with a hint that clients without support show no shadow.

