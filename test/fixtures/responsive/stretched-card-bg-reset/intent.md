---
feature: responsive
viewports: [600, 481, 480, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A painted, padded card beside a longer column in a flex row; under 480px the card keeps its place but drops its fill and padding.
Must stay true: no E017, the 480px screen is kept; above 480 the card's fill reaches the bottom of the row; at 480 and below the card is unpainted and its text starts at the cell edge.
