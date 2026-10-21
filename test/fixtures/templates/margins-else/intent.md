---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An `if` and an `else` block with different vertical margins between two blocks that have margins of their own.
Must stay true: whichever arm is shown, the spacing around it is the browser's (max of the neighbouring margins).
What both arms need sits outside the chain, each arm adds only its own extra (docs/templates.md#spacing-around-blocks).
