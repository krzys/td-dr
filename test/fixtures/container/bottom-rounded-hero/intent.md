---
feature: container
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A hero rounded only at the bottom (border-radius: 0 0 12px 12px, as in the React itinerary) and a note with
alternating corners (12px 0).
Must stay true: each corner keeps its own radius on the painted cell, with no diagnostic.
