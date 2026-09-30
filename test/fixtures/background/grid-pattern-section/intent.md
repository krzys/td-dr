---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
Grid-pattern section from the Larch newsletter: two translucent linear-gradients tiled with background-size, over a
background-color.
Must stay true: both layers and the size are kept as CSS for clients that paint them, the section colour is the
bgcolor, and text stays readable on it. Outlook just shows the plain colour (W005 says so).
