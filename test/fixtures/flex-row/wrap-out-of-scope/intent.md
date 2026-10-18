---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Tag cloud using flex-wrap: wrap with auto-width tags. It compiles as fluid-hybrid columns (docs/support.md#wrapping-rows).
Must stay true: tags wrap like the source at 600px and 375px, and the W003 says Outlook can't wrap auto-width items
(its ghost row keeps them on one line).
