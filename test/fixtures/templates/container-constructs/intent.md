---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
The construct on a whole flex row (its items stay a row: only the row is shown or not) and on a whole grid repeated per
entry; the items inside are written normally and read the loop variable.
Must stay true: the row or grid is lowered as always and wrapped as one unit; no E012, since the widths inside don't depend on data.
