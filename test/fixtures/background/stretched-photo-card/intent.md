---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.02 # the two 8px gutter cells round 1px differently from the flex gap, so the right card's text sits 1px off
expect: compile
codes: [W001]
status: active
---
Two cards in a flex row, one with a photo over a colour, one plain and taller. Both stretch to the row height; the photo card keeps its CSS photo.
Outlook cannot draw VML in a stretched cell, so it gets the colour and W001 says so.
