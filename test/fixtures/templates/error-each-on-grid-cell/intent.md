---
feature: templates
template: liquid
expect: diagnostic
codes: [E012]
status: active
---
`data-email-each` on a cell of a grid.
Must stay true: E012 with the cell's location; the cell is lowered once without the loop (the grid's tracks can't depend on data).
