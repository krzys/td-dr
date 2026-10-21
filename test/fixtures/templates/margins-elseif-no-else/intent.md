---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An `if` / `else-if` chain without an `else` between two blocks, the arms with different margins.
Must stay true: first arm, second arm and neither shown all give the browser's spacing.
