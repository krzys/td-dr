---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio600: 0.006 # no row padding to take the edge half-gap, so the first column sits 8px in, ~0.0050
maxDiffRatio375: 0.011 # same inset on every stacked item, ~0.0097
expect: compile
codes: [W003] # gap shortfall, trailing row gap, ragged heights
status: active
---
The most common way to write a wrap grid: gap with no row padding. Two 292px items plus a 16px gap fill the 600px line
exactly, then a full-width item.
Must stay true: the first two items share a line at 600px and the full-width item sits on its own line below; at 375px
everything stacks. No ghost row in Outlook is wider than 600px. Email has no negative margins, so the half gaps at the
row's edges come out of the line that would outgrow the row (the outer item of each side loses 8px, and a W003 says so).
