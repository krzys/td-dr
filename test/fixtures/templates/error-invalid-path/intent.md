---
feature: templates
template: handlebars
expect: diagnostic
codes: [E012]
status: active
---
A path with brackets, an alias with a space, and an alias without a list, on blocks and on a text-level element.
Must stay true: one E012 per mistake with the attribute and a hint; the construct is left out (no best effort).
