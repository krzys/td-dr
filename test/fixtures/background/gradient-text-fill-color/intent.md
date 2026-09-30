---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
The usual gradient-text idiom: -webkit-background-clip: text with -webkit-text-fill-color: transparent (no color: transparent).
Must stay true: the text is never invisible. Both the clip and the transparent fill are replaced by the first colour stop.
