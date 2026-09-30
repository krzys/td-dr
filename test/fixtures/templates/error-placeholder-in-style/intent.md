---
feature: templates
template: handlebars
expect: diagnostic
codes: [E013]
status: active
---
A placeholder inside a `style` attribute where it isn't a colour, next to one that is.
Must stay true: one E013, at the font-family placeholder; the colour (a whole `color` value, docs/templates.md#colours-from-data) passes.
The ESP fills text, attributes and whole colour values, not other CSS, and lowering needs real values.
