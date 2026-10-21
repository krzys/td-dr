---
feature: overflow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
A rounded overflow: hidden card with a full-width top photo and a painted last child that has side margins, so it does not touch the bottom corners.
Must stay true: the photo wears the top radius; the W001 names the bottom corners, which the margined child sticks out past.
