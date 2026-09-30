---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.05
maxDiffRatio375: 0.1
expect: compile
codes: []
status: active
---
Two ordered items with an Outlook-only item after the first. Must stay true: the browser shows the flexible item first and the 180px item second; the Outlook-only ghost cell travels with the item before it in the source (the 180px one).
(The browser source shows the Outlook-only item, the output hides it, so the visual diff is loose.)
