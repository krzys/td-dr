---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A list of line items: a flex row (name, quantity, price) repeated with `data-email-each="order.items"` and the loop variable
named `line` with `data-email-as`; inside the loop `order.currency` is read from outside the loop.
Must stay true: one repetition of the item's rows sits between the ESP's loop tags, and Handlebars reads the outer field
through `@root`. props.json has three items, props.empty.json none (the list collapses and the rest stays in place).
