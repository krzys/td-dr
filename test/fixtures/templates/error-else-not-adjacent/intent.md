---
feature: templates
template: handlebars
expect: diagnostic
codes: [E012]
status: active
---
An if and its else with something between them: a block between two blocks, text between two spans, and a
`<tddr-if>` / `<tddr-else>` with a paragraph between.
Must stay true: the if is kept (a lone if), the else is E012 ("isn't right after the branch it belongs to") with a hint
that only whitespace may sit between; nothing is guessed.
