---
feature: target-lint
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
Product review with a round avatar beside the reviewer name, using a flex row. Border-radius on images is ignored by
Outlook and some other clients, so the photo is kept square with a warning rather than failing. Must stay true: the
avatar keeps its 56px size and sits vertically centred beside the name, and the warning points at the border-radius
declaration on the img.

