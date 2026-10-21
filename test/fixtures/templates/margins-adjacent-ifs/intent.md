---
feature: templates
template: [handlebars, liquid]
viewports: []
expect: compile
codes: [W003]
status: active
---
A block with `margin-bottom: 16px`, two adjacent `if` blocks without margins, a block with `margin-top: 16px`.
With both absent the browser gives 16px between the outer blocks; padding on both sides would make 32px. Adjacent constructs are not solved, so W003 is reported.
