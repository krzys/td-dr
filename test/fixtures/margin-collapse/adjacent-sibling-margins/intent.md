---
feature: margin-collapse
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Receipt block with three paragraphs. Gap between row 1 and row 2 is max(16px, 24px) = 24px, not 40px.
Gap between row 2 and the total is max(16px, 8px) = 16px. Mixed px margins must collapse to the larger value.
Must stay true: the visible gaps are 24px and 16px at both widths, and the total line stays bold.
