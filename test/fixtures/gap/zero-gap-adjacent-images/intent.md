---
feature: gap
viewports: [600, 375]
maxDiffRatio: 0.0025
expect: compile
codes: []
status: active
---
Product strip: three images and three captions in two rows, with gap: 0 so cells touch.
Must stay true: no spacer is inserted between cells (zero gap emits no gutter), each image is 33% of the row, and each caption sits under its image.
Edge case: zero gap must not be treated as "no gap declared" and must not add a default gutter.
Tolerance 0.0025 (measured 0.0020 at 600): the caption row has content-sized columns, which table layout sizes slightly differently from flex (PLAN section 10).
