---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Fields whose values hold HTML-special characters (`<`, `&`, `"`, `'`) in text, in an href and in a title.
Must stay true: both engines escape every field (Liquid writes `{{ x | escape }}`), so the values show as typed: no
injected tags and no attribute cut short by a quote.
