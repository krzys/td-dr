---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A painted banner shown when `paid` and a reminder shown unless `paid`, both blocks of one column.
Must stay true: each block becomes its table rows wrapped in the ESP's if / unless, between the rows of the stack;
nothing else changes when one of them is left out. props.json (paid) and props.unpaid.json (not paid) are both rendered.
