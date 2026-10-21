---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Chains inside layout: in the right cell of a two-column flex row, a `data-email-if` / `data-email-else` pair of
painted blocks; in a flex column with a 12px gap, a three-branch chain between two fixed blocks.
Must stay true: a chain inside a cell is fine (the row's columns don't depend on data); every branch sits in the
same slot, and in the gapped column the gap goes inside each branch (padding-top of the branch's row), so the
spacing is right whichever branch shows.
