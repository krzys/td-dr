---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.035 # the browser moves "Hats" into the empty track, the table keeps it in the third, ~0.031
expect: compile
codes: [W014]
status: active
---
A three-track grid whose middle item is hidden under 480px. Must stay true: W014 is reported, the track keeps its cell, and at 375 the third item stays in its own track (the browser moves it into the second; the visual diff at 375 shows that).
