---
feature: flex-row
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.004 # painted cards keep px spacers; auto layout splits the narrowing by content
expect: compile
codes: []
status: active
---
Three `flex: 1` cards with an 18px gap (Larch's blog row). Must stay true: the cards are equal at both widths.
Splitting each gutter between its neighbours gave the middle card twice the padding of the outer ones, and since
the gutters are px while the widths are %, the middle card came out 4px narrower at 375.
At 375 the cards are still 1-2px apart: painted cards need spacer cells, and a px spacer can't shrink with the
row's % like padding does, so auto layout hands the difference out by content. Fixed layout would make them exact
but lets nowrap content spill out of a squeezed card (flex-row/stretched-cards-squeezed), so it isn't used.
