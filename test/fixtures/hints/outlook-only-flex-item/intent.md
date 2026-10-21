---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.05
maxDiffRatio375: 0.1
expect: compile
codes: []
status: active
---
An outlook-only item in the middle of a flex row, between a px card and a flex:1 card.
Must stay true: other clients get no cell for it, not even an empty one, and no gutter for it: the flex:1 card
spans what the px card and the single gap leave. The whole `<td>` (width included) sits inside one
`<!--[if mso]>` conditional, so Outlook alone has the extra cell. (The browser source shows the item,
the output hides it, so the visual diff is loose.)
