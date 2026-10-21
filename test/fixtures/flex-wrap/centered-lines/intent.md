---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Four 180px cells in a wrapping row with justify-content:center and align-items:center.
Must stay true: every wrapped line is centered as a group (the lone fourth cell sits in the middle of line 2) and cells on one line are vertically centered.
