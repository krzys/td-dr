---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.07
maxDiffRatio375: 0.125 # the browser source shows the notice, the output hides it
expect: compile
codes: []
status: active
---
A padded, painted box whose only child is outlook-only, above a normal box.
Must stay true: other clients get the white box as an empty filler cell (zero-size text, no table of rows);
Outlook gets the notice inside the same cell with its normal font size and line height, not font-size:0.
(The browser source shows the notice, so the visual diff is loose.)
