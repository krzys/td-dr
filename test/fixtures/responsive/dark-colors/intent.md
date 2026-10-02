---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A white card with dark text and a prefers-color-scheme: dark rule for its colours. The visual harness renders light only,
so the dark rules are asserted in the golden.
Must stay true: the color-scheme and supported-color-schemes meta and :root exist only because dark rules do; the dark
@media rule carries background-color and color; the Outlook.com [data-ogsc] (colour) and [data-ogsb] (background)
mirrors follow it.
