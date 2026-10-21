---
feature: padding-margin
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Receipt card: heading with 8px bottom margin, a paragraph with 16px bottom margin, and a note with 12px top margin directly after it.
Must stay true: the paragraph-to-note gap is 16px (adjacent vertical margins collapse to the larger value), not 28px, and the heading-to-paragraph gap is 8px.
Margins must become spacing without changing the card's 16px/24px padding.
