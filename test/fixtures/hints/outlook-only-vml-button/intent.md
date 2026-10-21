---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.06
expect: compile
codes: [W003, W005]
status: active
---
A rounded button marked outlook-only.
Must stay true: the button is lowered to its table plus VML as usual, but the whole thing is wrapped in one
`<!--[if mso]>` conditional that keeps only the Outlook side: the `v:roundrect` stays, the `<a>` table
(the `[if !mso]` branch) is dropped, so no other client sees a link or a gap. (The browser source shows the
button, so the visual diff is loose.)
