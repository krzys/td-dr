---
feature: link
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I004]
status: active
---
A link card holding a paragraph of text, an image inside a `<p>` and an image inside a `<span>`.
Must stay true: both images carry the link (their own `<a>` inside the text block), and I004 counts three leaves.
