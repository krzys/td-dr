---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An order status banner as a chain of `data-email-if="order.status == 'paid'"`, `data-email-else-if="order.status == 'shipped'"`,
`data-email-else-if="order.delayed"` and `data-email-else`, four painted blocks of one column, and a footer.
Must stay true: Liquid writes one `{% if %}` with `{% elsif %}` branches and an `{% else %}`; Handlebars nests the
comparisons (`{{#equals}}` with `{{else}}`), with `{{else if order.delayed}}` only where the condition is a plain path.
Exactly one banner shows for each of the four data sets.
