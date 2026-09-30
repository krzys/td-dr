---
feature: container
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Sale hero: a 600px dark container holding an img with no width or height attributes, followed by a paragraph.
The image has only max-width 100% in CSS, so its intrinsic height is unknown to the compiler until rendering.
Must stay true: the image scales to container width without overflow at 375, and the paragraph sits directly below it with no gap.
