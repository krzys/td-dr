---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Mobile-first hide of an inline img and span in a paragraph (min-width:481px hides them), no display on the reveal.
Must stay true: the narrow rule restores display:inline, not block, so nothing breaks onto its own line.
