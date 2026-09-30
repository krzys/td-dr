---
feature: templates
template: [handlebars, liquid]
viewports: [] # no pixel diff: the extra margin is the loss W003 reports
expect: compile
codes: [W003]
status: active
---
A wrapper with no margin or padding ending in an `if`/`else` pair (the `if` arm has `margin-bottom: 24px`, the `else` arm 0), then a block with `margin-top: 20px`. The gap is 24px or 20px depending on the arm, which padding cannot reproduce, so W003 is reported.
