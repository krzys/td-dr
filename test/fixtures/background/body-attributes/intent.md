---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I014]
status: active
---
An old-style page coloured only by `<body>` attributes: `bgcolor` for the page, `text` for the copy and `link` for links.
Must stay true: the shell paints the whole page dark blue (bgcolor and CSS), the copy is white and the link yellow,
and the contrast lint reads those colours, so it raises no W016. `vlink` has no effect: a sent email can't tell visited links.
