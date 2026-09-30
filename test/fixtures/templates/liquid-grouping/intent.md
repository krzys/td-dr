---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Conditions whose grouping Liquid can't write as it reads them: Liquid has no parentheses and reads `and` / `or`
right to left. `(a.x || a.y) && (b.x || b.y)` and `a.x && a.y || b.x && b.y` have two groups, `!(a.x || a.y) && b.x`
negates paths. A path test is written `p and p != 0 and p != ""` (docs/templates.md#dialects), so in an `or` it is a group of its own:
`a.x || a.y && b.x` and `a.x && a.y || b.x` need a flag too. The last block is a chain whose else-if needs a flag.
Must stay true: what Liquid can't write inline is computed first into a `tddr-N` flag with nested `{% if %}` /
`{% unless %}` and `{% assign %}`, then tested. Handlebars nests. All data sets match the preview.
