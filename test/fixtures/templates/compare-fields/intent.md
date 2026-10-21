---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Branches on two fields compared with each other: a block shown when `order.ship.city == user.city` and its
unless twin, a text-level `!=` span, and an `==` inside an each between the loop variable and a root field.
Must stay true: Handlebars writes `{{#equals a b}}` / `{{#notEquals a b}}` with both sides as paths (the root
field inside the loop as `@root.user.store`), Liquid writes `{% if a == b %}` / `{% unless %}`; both data sets
render the same as the preview.
