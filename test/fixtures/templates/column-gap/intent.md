---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
A flex column with `gap: 12px` whose children are a heading, an `if` banner, a list repeated with `each` and a footer.
Must stay true: the gap goes inside the construct (every repetition keeps it, a left-out banner takes its gap along), so
the spacing is the source's in every data set: props.json (everything), props.bare.json (no banner, no items).
