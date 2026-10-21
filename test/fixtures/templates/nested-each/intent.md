---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A list inside a list: shipments, each with its own parcels (`data-email-as` names both variables), with fields from the
outer variable, the inner variable and the root read at the innermost level.
Must stay true: both loops are emitted as nested blocks; every field resolves to the right level in both dialects.
