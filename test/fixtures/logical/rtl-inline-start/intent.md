---
feature: logical
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A right-to-left notice: direction: rtl with padding-inline-start/-end, border-inline-start and, on the inherited-rtl child, margin-inline-end.
Must stay true: the blue bar and the 40px padding are on the right, the 8px padding on the left; the inner pale box keeps 64px
clear on its left and its 8px padding on its right; text is right-aligned.
