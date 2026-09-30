---
feature: templates
template: handlebars
expect: diagnostic
codes: [E012]
status: active
---
An else with no if before it, at block level and in text: a `data-email-else` block first in its parent, a
`<tddr-else>` and a `<tddr-else-if test>` after plain blocks, and a `data-email-else` span in a paragraph.
Must stay true: one E012 per stray else with its location and a hint (an else goes right after an if or else-if);
the element is shown once, as written, without a branch.
