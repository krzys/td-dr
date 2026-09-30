---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.05
expect: compile
codes: []
status: active
---
An outlook-only item between two tiles of a wrapping row.
Must stay true: the two tiles keep their 300px columns for every other client, with no empty inline-block
between them. The item's ghost cell (`</td><td width>`) and its column both sit in one `<!--[if mso]>` conditional,
and the Outlook ghost table is as wide as all three cells. (The browser source shows the item, so the visual diff is loose.)
