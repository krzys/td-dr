---
feature: link
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I004]
status: active
---
A whole article card wrapped in one link: image, heading, text and a "read" line.
Must stay true: no `<a>` wraps a table. The image, the heading, the paragraph and the read line each
carry the href with their own colour and no underline, and I004 says the padding isn't clickable.
