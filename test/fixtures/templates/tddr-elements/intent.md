---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
The transparent elements at block level and in text: `<tddr-if test>` with two blocks, `<tddr-else-if test>` and
`<tddr-else>` (with whitespace between them), a `<tddr-each of as>` with two blocks per item, a `<tddr-each>` around the
`<li>` of a list, and an inline `<tddr-if>` in a sentence.
Must stay true: the elements leave no trace; their children take their place (the cascade sees them as children of the
real parent); a branch of several blocks is one unit between the markers, and the output matches the preview.
