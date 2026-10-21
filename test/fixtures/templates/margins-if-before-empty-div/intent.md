---
feature: templates
template: [handlebars, liquid]
viewports: []
expect: compile
codes: [W003]
status: active
---
A block with `margin-bottom: 16px`, an `if` banner, an empty div with `margin-top: 20px`, then a block.
With the banner absent the 16px and the empty div's 20px collapse to 20px; the empty div's margin passes through, so the pair is not solved and W003 is reported.
