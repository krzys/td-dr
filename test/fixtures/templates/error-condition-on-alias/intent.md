---
feature: templates
template: [handlebars, liquid]
expect: diagnostic
codes: [E012]
status: active
---
`data-email-if` / `-unless` on the element that also carries `data-email-each`, reading the loop variable (named with
`data-email-as`, or the default `item`). The condition opens outside the loop, where the variable doesn't exist.
Must stay true: one E012 per element with a hint to move the condition to a child; the loop is kept, the condition is
left out.
