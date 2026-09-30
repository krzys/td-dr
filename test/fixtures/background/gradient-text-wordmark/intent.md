---
feature: background
viewports: [600]
maxDiffRatio: 0.002
expect: compile
codes: [I003, W001]
status: active
---
Wordmark from the Velra email: text painted by a gradient (background-clip: text over color: transparent).
Must stay true: the output text is never transparent. It becomes the gradient's first colour with a W001 saying so.
The small diff against the browser (the gradient's second half is lost) is the point of the warning.
