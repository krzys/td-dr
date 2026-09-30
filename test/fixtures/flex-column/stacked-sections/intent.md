---
feature: flex-column
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Vertical stack of four cards with 16px gap, 24px outer padding, stretched to full width by default (align-items: normal).
The last card holds a full-width image with no height attribute (intrinsic height from the placeholder). Must stay true:
cards are equal width, the gap between every pair is exactly 16px, and the image does not overflow its card at 375px.
