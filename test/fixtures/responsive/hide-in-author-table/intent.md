---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A div and a td inside an author table, display:none in the base and shown under 480px.
Must stay true: both stay hidden at 600 and show at 375; both carry the hide decls and the Outlook guard.
