---
feature: gap
viewports: [600, 375]
maxDiffRatio: 0.0045
expect: compile
codes: []
status: active
---
Shipping info row: three tinted tiles with 12px gap between them, and each tile has its own 16px/8px padding.
Must stay true: the gap is measured between the padded tile edges (padding is not added to the gap), the fixed 120px tile keeps its width, and the grow tile takes the remainder.
Edge case: the long SKU must wrap inside the grow tile (overflow-wrap) and must not widen the row beyond the container.

Tolerance 0.0045 (measured 0.0036 at 600): the content-sized 'Free' tile ends up 14px wider because table layout shares the grow tile's unbreakable-SKU slack across auto columns.