---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Hero banner with width="600" height="240" attributes, CSS max-width: 100% and height: auto, inside a 600px container.
At 600 the image is 600x240; at 375 it scales down to 375x150 and keeps its aspect ratio.
Must stay true: no horizontal overflow at 375, the paragraph sits directly below the image with no gap, and the image is not cropped.
