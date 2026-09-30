---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Branches on a string value: a block shown when `order.taxExempt == 'Yes'` and its unless twin (the else), a
text-level `!=` span, and an `==` inside an each reading the loop variable.
Must stay true: Handlebars writes the ESP helpers `{{#equals}}` / `{{#notEquals}}` (the unless twin becomes notEquals),
Liquid writes `{% if a == "b" %}` / `{% unless %}`; both data sets render the same as the preview.
