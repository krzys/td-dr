---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.05
expect: compile
codes: []
status: active
---
A data-email="outlook-only" block after a normal paragraph.
Must stay true: the block is lowered normally (padding becomes a table cell) but wrapped in an <!--[if mso]> conditional,
so Gmail and Apple Mail never show it. The attribute does not reach the output. (The browser source shows the block,
the output hides it, so the visual diff is loose.)
