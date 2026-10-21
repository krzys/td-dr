---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Text-level elements inside a paragraph carry `data-email-if` / `data-email-unless` and `data-email-each` (a list of tags
inside a line). They are not lowered, so the block markers go around the serialized element in the line's text.
Must stay true: `{{#if}}<span>…</span>{{/if}}` sits inside the paragraph; nothing else in the line moves.
props.json is paid with two tags, props.unpaid.json is unpaid without tags.
