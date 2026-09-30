---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
`data-email-if` and `data-email-each` on the same element (the whole list is guarded: if outside, each inside), and an
`data-email-if="line.onSale"` inside the loop, which reads the loop variable.
Must stay true: the guard opens before the loop; inside the loop Handlebars still reads `line.onSale` off the variable.
props.json has sale items, props.none.json has `show: false` with a list that must not render.
