---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
A bottom-bleeding totals band with padding-bottom 0 whose last p has margin-bottom 12px. In CSS that margin collapses with the band's -24px and lands inside the card; once the card's padding is gone it would escape, so the pass refuses: E005, never a silent misrender.
