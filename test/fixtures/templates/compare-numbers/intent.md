---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Branches on a number: a block shown when `order.qty == 0`, its unless twin, and a text-level `!= 1` span.
Must stay true: the number is written unquoted, Handlebars `{{#equals order.qty 0}}` / `{{#notEquals order.qty 1}}`
and Liquid `{% if order.qty == 0 %}` / `{% if order.qty != 1 %}`; both data sets render the same as the preview.
