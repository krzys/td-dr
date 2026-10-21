---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
Mirror of band-collapsing-child-bottom: a top-bleeding band with padding-top 0 whose first p has margin-top 10px. The margin would escape above the card, so E005.
