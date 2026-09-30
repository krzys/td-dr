---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A data-email="raw" block containing a flex container, between two paragraphs.
Must stay true: the block is emitted as-is with inlined styles, its flex container is not lowered to tables, no layout
diagnostic is reported from inside it, and the data-email attribute does not reach the output.
