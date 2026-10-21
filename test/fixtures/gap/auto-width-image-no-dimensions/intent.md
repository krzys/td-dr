---
feature: gap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Footer row: an image with no width or height attributes, a text block and a link, all auto-width, with a 16px column-gap.
Must stay true: auto-width cells get no fixed width, the image keeps its natural size, and the 16px gap is kept between all three items with items vertically centered.
Edge case: content-sized cells cannot be computed by the compiler, so the output must not invent a width for the image or the text.
