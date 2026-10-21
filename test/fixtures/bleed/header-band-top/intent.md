---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Rounded 2px-bordered card with 24px padding; the first child is a dark header band with margin: -24px -24px 16px. It must touch the card's top and side inner edges, take the top radii inset by the border width, and the items keep their 24px inset.
