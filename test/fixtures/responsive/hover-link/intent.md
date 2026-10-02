---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A text link that changes colour and gets an underline on :hover.
Must stay true: the link keeps its resting colour inline; the generated class appears in a plain .t-0:hover rule with
no @media, after the width and dark rules.
