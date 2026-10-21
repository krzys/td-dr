---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A block and a flex column that are display:none by default and shown under 480px.
Must stay true: what is hidden in the base is hidden in Outlook too. Outlook does not carry a td's display:none to the tables inside it, so the hidden content sits inside an [if !mso] guard under a cell that also has mso-hide:all.
