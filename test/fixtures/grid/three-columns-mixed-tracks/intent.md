---
feature: grid
viewports: [600, 375]
maxDiffRatio600: 0.03 # fr columns beside the px column are sized by content (the W003), ~0.026
maxDiffRatio375: 0.02 # same, ~0.014
expect: compile
codes: [W003]
status: active
---
grid-template-columns: 200px 1fr 2fr with a 12px column gap in a 600px page. Must stay true: the first column is
exactly 200px, the gutters are 12px, and the fr columns share the rest. The emitter sizes fr columns that sit
beside a px column by content rather than by 1:2, so the rule reports W003 and the diff budget is wider.
