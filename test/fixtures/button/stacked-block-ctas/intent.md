---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Primary and secondary call-to-action links stacked in one container, both display: block with a 280px cap.
Must stay true: each link is its own bulletproof button (block links break the line, so they never join a text run),
304px wide and centered, with 12px between them; both get Outlook VML and a 304px ghost table.
