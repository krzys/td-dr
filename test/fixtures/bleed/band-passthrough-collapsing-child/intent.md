---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
A text-root blockquote band bleeding at the bottom whose last p has margin-bottom 12px: that margin would collapse into the bleed. E005 from the pass-through path (not the container leaks() path).
