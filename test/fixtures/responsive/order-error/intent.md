---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E017]
status: active
---
Two items of one shape swapped with `order` under 480px: the emitted tag sequence is the same, only which element
sits in which cell changes.
Must stay true: E017 for the max-width 480px rules naming the order of elements (the items at lines 11 and 12);
the base keeps the source order.
