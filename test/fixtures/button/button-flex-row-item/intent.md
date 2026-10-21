---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A flex row with a text column and a button as the second item. The button is blockified by flex, so it fills its content-sized column.
Must stay true: the text is on the left, the button on the right at its content width plus 20px side padding, both vertically aligned to the top.
