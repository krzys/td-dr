---
feature: responsive
viewports: [601, 600, 481, 480, 414, 375, 320]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Padding and title size change at 600px and again at 480px.
Must stay true: two flat rules, widest first: (min-width:481px) and (max-width:600px), then (max-width:480px). The 600
render uses the first, the 375 render the second.
