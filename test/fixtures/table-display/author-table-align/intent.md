---
feature: table-display
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Author tables placed by align or by auto side margins: align="center", align="right" (floated, alone in a flow-root box), margin: 0 auto in CSS, a table inside a div with align="center", and one with margin: 0 inside a <center>, which still centres it as in browsers. A centred one keeps margin:0 auto, which the margin:0 every author table gets used to override; the right one keeps floating by its attribute.
Must stay true: the first, third, fourth and fifth tables are centred, the second sits at the right edge, the text in the fourth and fifth stays at the start (tables reset the centring for their cells), and the 12px gaps stay.
