---
feature: templates
template: [handlebars, liquid]
viewports: [] # no pixel diff: the extra margin is the loss W003 reports
expect: compile
codes: [W003]
status: active
---
A block with `margin-bottom: 20px`, then a wrapper with no margin or padding whose first child is an `each` list with `margin-top: 8px`, followed by a plain block. With rows the items add to the 20px (28px vs 20px with an empty list), so W003 is reported.
