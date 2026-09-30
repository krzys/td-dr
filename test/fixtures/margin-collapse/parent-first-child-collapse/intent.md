---
feature: margin-collapse
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Newsletter block with no padding or border on the parent. The h2 margin-top of 24px collapses through the parent,
so the heading sits 24px below the previous content and the beige background starts at the heading's top edge.
Must stay true: the 24px space above the heading is outside the beige block, and the paragraph keeps its 12px bottom margin.
