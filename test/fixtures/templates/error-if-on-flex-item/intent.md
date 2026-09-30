---
feature: templates
template: handlebars
expect: diagnostic
codes: [E012]
status: active
---
`data-email-if` on an item of a flex row.
Must stay true: E012 with the item's location and the code's hint (widths would depend on data); the item is lowered
without the construct, so the output holds it as a plain column and no if block.
