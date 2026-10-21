---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A block with `margin-bottom: 16px`, an `if` banner with `margin: 24px 0`, a block with `margin-top: 16px`.
Must stay true: the filled template has the browser's spacing in both data sets. Banner shown: 24px above and
below it. Banner dropped: the two blocks are 16px apart, not 32px. The 16px sits outside the `if`, the extra
8px above the banner and the 24px below it sit inside (docs/templates.md#spacing-around-blocks).
