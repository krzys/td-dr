---
feature: templates
template: [handlebars, liquid]
expect: diagnostic
codes: [E012, E013]
status: active
---
Placeholders in attributes td;dr doesn't carry over: `bgcolor` and `title` on boxes that are lowered to tables, a
`data-` attribute on a span. The link's href and title are kept.
Must stay true: E013 for the presentational `bgcolor`, E012 for the others, each at its element with a hint; nothing
about the kept link.
