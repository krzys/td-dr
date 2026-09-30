---
feature: article
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Billing reminder paragraphs with strong, em, and anchor links inside paragraphs.
Text-level elements must pass through inline with their styles inlined; they must not become layout blocks.
Must stay true: links keep color and underline, strong stays bold, each paragraph wraps at the same words.
