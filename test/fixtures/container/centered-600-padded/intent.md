---
feature: container
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Receipt header on a grey page: a 600px centered white container with 24px padding around an h1 and a paragraph.
The container must lower to a centered fixed-width block with its padding and background preserved.
Must stay true: at 600 the white box is exactly 600px wide and centered; at 375 it fills the viewport minus gutters with the same padding.
