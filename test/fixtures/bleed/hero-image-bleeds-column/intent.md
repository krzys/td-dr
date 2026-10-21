---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A 600px column with 24px padding holds a heading, a hero image written with margin: 0 -24px so it runs to the
column's side edges, then a paragraph. Must stay true: the image is full column width, the heading and
paragraph keep their 24px inset.
