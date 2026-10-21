---
feature: css-values
viewports: [600, 375]
maxDiffRatio: 0.003
expect: compile
codes: []
status: active
---
Tailwind v4 style theme variables: spacing as calc(var(--spacing) * n), a unitless line-height ratio, oklch() colours and
a color-mix(in oklab) border. Everything is folded to px and hex before lowering, and no oklch/color-mix/calc is left in the output.
