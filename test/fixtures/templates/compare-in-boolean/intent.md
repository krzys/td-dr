---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Field-against-field and field-against-string comparisons inside boolean expressions: a delivery note on
`order.ship.city == user.city && !order.pickup`, a coupon line on `order.coupon != '' || user.vip`, a chain on
`user.tier == 'gold' && order.currency == user.currency` / else-if `order.currency != user.currency`, and inside the
list of lines `line.sku == wish.sku && line.stock` (a loop variable against a root field).
Must stay true: Handlebars writes `{{#equals}}` / `{{#notEquals}}` nested in `{{#if}}` / `{{#unless}}`, the root fields
inside the loop as `@root.`; Liquid writes the comparisons inline with `and` / `or`. Both data sets match the preview.
