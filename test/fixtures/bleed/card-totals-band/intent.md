---
feature: bleed
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Rounded white card with 24px padding: a title, two item rows, then a grey totals band written as
margin: 0 -24px -24px so it runs to the card's side edges and bottom. Must stay true: the band touches the
card's left, right and bottom edges, its bottom corners follow the card's radius, and the title and items keep
their 24px inset.

Known deviation: CSS does not clip a child to its parent's radius without overflow:hidden, so the browser draws square band corners; the output rounds them (as the spec asks). The visual tolerance (maxDiffRatio) absorbs the corner pixels.
