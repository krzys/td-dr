---
feature: templates
template: handlebars
expect: diagnostic
codes: [E012]
status: active
---
Conditions the grammar can't read, and misuse of the elements: `a &&` (ends early), `b === 'x'` (=== isn't part of it),
`<tddr-if test="(a || b">` (unclosed), a `<tddr-if>` without a test, a `data-email-else="x"` with a value, and a class on a `<tddr-if>`.
Must stay true: one E012 each, with the location and a hint; a chain with a bad branch is shown without the construct.
