---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
The band's parent has no padding but its grandparent has 24px. In CSS the band reaches the grandparent's edge, which the bleed pass does not lower (only the direct parent's padding counts), so E005.
