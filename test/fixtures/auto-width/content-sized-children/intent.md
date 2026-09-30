---
feature: auto-width
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Nav row of three text links with no width set, so each link is sized to its content and not stretched to equal columns.
Must stay true: the active "Returns" link keeps its blue box hugging its text plus 12px side padding, the row starts at
24px left padding, and all three links stay on one line at 375px.
