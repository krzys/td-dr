---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.12
expect: compile
codes: []
status: active
---
An outlook-only flex item without a width, holding a flex row of two 40px items and a 120px image, in a row
whose other item has flex: 1 (nothing is left over for auto items).
Must stay true: the outlook-only content is sized against the row's inner width, so it keeps its px sizes and
raises no W003/W004. Other clients get nothing for it. (The browser source shows the item, so the visual diff is loose.)
