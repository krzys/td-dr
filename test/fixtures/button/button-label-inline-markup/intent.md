---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A rounded button whose label has bold text, an entity and a small inline image.
Must stay true: the label keeps its markup in the HTML version. The VML label carries the same markup, and the Outlook width is estimated from the visible text (W003).
