---
feature: css-values
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A card whose background, text, border and title colours are light-dark() values, two of them through custom properties
on a `color-scheme: light dark` root, and a note under it with `color-scheme: only light`. The visual harness renders
light only, so the dark rules are asserted in the golden.
Must stay true: no light-dark() in the output; the light arms are inline (the card's background also as bgcolor, the
title's hsl() as hex); the dark arms are prefers-color-scheme rules with their [data-ogsb] / [data-ogsc] mirrors and the
colour-scheme metas; the only-light note keeps its light colours and has no dark rule.
