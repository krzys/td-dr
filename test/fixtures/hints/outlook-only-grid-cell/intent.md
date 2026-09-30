---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.12
expect: compile
codes: []
status: active
---
An outlook-only cell between grid cells.
Must stay true: it takes no place in the grid for other clients (cell two stays in the first row, cell three
starts the second), and Outlook gets one extra `<td>` in the row of the cell before it, inside an
`<!--[if mso]>` conditional, with no track of its own. (The browser source gives the item a cell of its own
and pushes the rest along, so the visual diff is loose.)
