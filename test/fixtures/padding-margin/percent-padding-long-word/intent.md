---
feature: padding-margin
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E006]
status: active
---
Return confirmation: block at 80% width, centered with margin: 0 auto, with percentage top/side padding (5% 4%) and 12px bottom padding.
Must stay true: percentage padding resolves against the block's own width, the block stays centered at both viewports, and the long reference wraps inside the padding instead of overflowing.
Edge case: the image has a fixed 200x60 size and must keep its margin-top of 8px.
Out of scope (docs/support.md#boxes-and-content): percentage padding is reported as E006.
