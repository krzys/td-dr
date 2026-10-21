---
feature: templates
template: [handlebars, liquid]
viewports: [] # no pixel diff: the extra margin is the loss W003 reports
expect: compile
codes: [W003]
status: active
---
A wrapper with no margin or padding whose last child is an `if` banner with `margin-bottom: 24px`, then a block with `margin-top: 20px`. Present, the 24px collapses through the wrapper bottom with the 20px (24px gap); absent, the gap is 20px. W003 is reported.
