---
feature: css-values
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
calc() flex-basis values that mix % with rem or more than one px term: Tailwind's calc(50% - 0.5rem) halves with a
1rem gap, calc((100% - 20px) / 2) halves with a 20px gap, and calc(50% - 4px - 6px) halves with a 20px gap.
Must stay true: each folds to calc(P% - Npx) and lowers like a hand-written one (docs/support.md#flex-rows): at 600px the halves are
292px each, the other halves 290px; no E006.
