---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A rounded content-sized button whose label is longer than the container.
Must stay true: in browsers the button wraps inside the 552px content box. Outlook's VML shape is estimated (W003) but
never wider than the 552px slot, and it is tall enough for the wrapped lines.
