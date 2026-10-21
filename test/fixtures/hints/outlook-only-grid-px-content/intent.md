---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.12
expect: compile
codes: []
status: active
---
An outlook-only grid cell with px-sized content: a flex row of two 40px items and a 120px image.
Must stay true: the content is sized against the room the row has, not against the (zero) space the tracks
leave over, so the two items keep `width="40"` in Outlook and there is no W003/W004 about the cell.
Other clients get nothing for it. (The browser source shows the cell, so the visual diff is loose.)
