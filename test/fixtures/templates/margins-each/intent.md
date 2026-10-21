---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A block with `margin-bottom: 16px`, a list whose items have `margin-bottom: 8px`, a block with `margin-top: 4px`.
Must stay true: with no, one or many items the filled template has the browser's spacing: 16px between the blocks
when the list is empty, 8px between items, and the last item's 8px collapsing with the 4px below it. The 16px
sits outside the loop, the 8px of an item inside it (docs/templates.md#spacing-around-blocks).
