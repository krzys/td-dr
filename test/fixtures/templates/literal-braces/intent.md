---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Author text that looks like template syntax: `{{ not a path }}`, `{{{ … }}}`, a brace right against a field
(`{{{user.code}}}` is a field in braces), backslashes before `{{` and before a field.
Must stay true: each engine shows that text exactly as written (Handlebars `\{{`, Liquid `{{ "{" }}`, an entity for a
lone brace next to a field in Handlebars), and the fields next to it still work.
