---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.12
expect: compile
codes: []
status: active
---
Rows whose items are all outlook-only: a bare flex row with margins, a bare grid, and a flex row with a painted box.
Must stay true: the bare row and grid are Outlook's alone (one `<!--[if mso]>` block, no empty `<tr>`, no
wrapper or margin left for other clients), and the painted box gives other clients its filler `&nbsp;` cell,
exactly what an empty box would give, while Outlook gets the cells on top. (The browser source shows the items
and their boxes, so the visual diff is loose.)
