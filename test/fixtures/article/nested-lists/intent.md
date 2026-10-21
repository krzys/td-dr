---
feature: article
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Lists inside list items and lists with a type attribute, with no author list CSS. A nested list has no top or bottom margin and takes circle, then square bullets, as in browsers; type picks the marker (a, A, i, I on ol and li, square and none on ul).
Must stay true: the nested lists sit tight under their item, the markers match the source at every level, the "a" list starts at c, and the type="none" list has no marker.
