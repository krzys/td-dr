---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Rounded inline-block button with width: 200px and box-sizing: border-box, so the outer box is exactly 200px.
Must stay true: the button is 200px wide, left aligned, and the label centered. No W003: the width is known, so the Outlook VML roundrect is exactly 200px wide.
