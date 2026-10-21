---
feature: responsive
viewports: [600, 481, 480, 375, 320]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A grey card with 32px padding that shrinks to 16px under 480px.
Must stay true: the base output keeps the desktop padding inline; a generated class on the card cell carries the
narrow padding in one @media screen and (max-width:480px) rule with ` !important`; the 375 render matches the input.
