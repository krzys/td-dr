---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two flex items with `width: calc(50% - 10px)` and a 20px gap, not wrapping.
Today width: calc() on a flex item is E006 without the calc hint (inherit.ts and box.ts); activate once the shared-file change in the unit report lands. Must stay true: 290 + 20 + 290 at 600px.
