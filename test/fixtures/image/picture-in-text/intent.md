---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I007]
status: active
---
An inline picture inside a paragraph is unwrapped in the text path: the img stays in the line and one I007 reports the dropped sources.
