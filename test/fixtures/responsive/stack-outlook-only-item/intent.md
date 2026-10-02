---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A row with an Outlook-only column, stacked under 480px.
Must stay true: the Outlook-only cell is untouched by the stacking styles; the first visible column gets no top gap.
