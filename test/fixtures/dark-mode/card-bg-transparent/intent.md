---
feature: dark-mode
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A painted card beside the copy in a stretched flex row whose fill goes transparent in dark mode.
Must stay true: no E017, the dark screen is kept: the card's cell gets the dark background-color:transparent rule (with the [data-ogsb] mirror) and the dark text colours; the light rendering is the card painted to the row's height.
