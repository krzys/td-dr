---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A wrapping row with a 700px item in a 600px email.
Must stay true: the wide item shrinks to the line width (600px, then the phone width at 375px) like a lone flex item does, and the Outlook ghost table is never wider than 600. W003 reports the clamp.
