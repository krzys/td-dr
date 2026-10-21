---
feature: templates
template: [handlebars, liquid]
expect: diagnostic
codes: [E012]
status: active
---
`data-email-if` on a preheader, and a preheader inside a `data-email-unless` block. The preheader is taken out of the
body before any hint is read, so either condition would be ignored.
Must stay true: one E012 each, at the preheader, with a hint to send the preheader text as a field.
