---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two painted cards, each a fluid image (width: 100%) over a line of text, that stack under 480px.
Must stay true: the images keep their 268px desktop cap (max-width and the width attribute, which Outlook uses), and where the row stacks a head rule lifts the cap to the stacked card's width, so each image fills its full-width card as in the browser.
