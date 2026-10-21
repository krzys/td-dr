---
feature: responsive
viewports: [600, 481, 480, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A side label paragraph with a right border and padding beside the copy in a stretched flex row; under 480px the row stacks and the label loses its border and padding.
Must stay true: no E017, the 480px screen is kept; above 480 the border runs the full height of the row; at 480 and below the label sits above the copy with no border.
