---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An `data-email-if="paid"` banner with a `data-email-else` banner right after it (whitespace between), both painted
blocks of one column.
Must stay true: one chain, not an if / unless pair: Handlebars `{{#if paid}}…{{else}}…{{/if}}`, Liquid
`{% if paid %}…{% else %}…{% endif %}`, each branch the whole `<tr>` of its block in the same slot between the
rows of the stack. props.json (paid) and props.unpaid.json both render like the preview.
