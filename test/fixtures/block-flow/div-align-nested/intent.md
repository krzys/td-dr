---
feature: block-flow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
The legacy align attribute and `<center>` beyond direct children: browsers' -webkit-center and -webkit-left are a text-align, so they reach every block below until a text-align of its own, and they place a block whatever its margins, so a `* { margin: 0 }` reset doesn't undo them. Under dir="rtl", align="left" pulls a block to the left edge.
Must stay true: the blue box is centred, the yellow box sits at the left, the green box sits at the left edge of the rtl block, and the linked image is centred.
