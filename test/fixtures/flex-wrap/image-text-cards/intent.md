---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio600: 0.004 # the shorter tile doesn't stretch to its neighbour (the W003), ~0.0036
expect: compile
codes: [W003]
status: active
---
Two 260px border-box tiles, each a 72px image beside wrapped text, in a row with a 20px gap and 20px outer padding.
Must stay true: at 600px the tiles sit side by side (260+20+260 = 540 of 560px); at 375px they stack with 20px
between them. Inside each tile the image stays 72px and vertically centered, the text column takes the rest of the
tile and wraps, and the image never shrinks. The shorter tile keeps its own height at 600px (W003).
