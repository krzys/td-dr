---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I003]
status: active
---
A two-column grid with a gap and painted cells; the second item is display:none under 480px.
Must stay true: the hidden item keeps its track (cell, width and gutter) with its content in a hide cell, so the first cell stays half the row at 375, as the grid keeps the empty track.
