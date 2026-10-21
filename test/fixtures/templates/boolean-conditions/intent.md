---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Account notices guarded by `&&`, `||`, `!` and parentheses (`user.vip && !user.trial`, `cart.empty || cart.expired`,
`!(user.optedOut || user.bounced)`, `(user.vip || user.staff) && promo.active`), and a chain whose else-if is
`user.trial || !user.verified`.
Must stay true: Handlebars has no boolean operators, so `&&` nests `{{#if}}` blocks and `||` repeats the body in the
else; Liquid writes `and` / `or` inline (no parentheses: `promo.active and user.vip or user.staff`). Every data set
shows the same notices as the preview.
