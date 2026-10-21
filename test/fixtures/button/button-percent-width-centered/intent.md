---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A block button, 50% wide, centered with auto margins, rounded.
Must stay true: the button is half the container wide and centered. A percentage width has no known Outlook size, so Outlook shows square corners and W003 says so.
