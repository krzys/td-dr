---
feature: image
viewports: [600, 375]
maxDiffRatio375: 0.03 # same, ~0.0272
maxDiffRatio: 0.02 # the output paragraph below the image is its own cell, so the source text beside it keeps wrapping where the output sits below (W001), ~0.0165
expect: compile
codes: [W001]
status: active
---
A floated image that is its own block, followed by a paragraph. In a browser the text would wrap; in email it sits below, so W001 says nothing wraps and points to putting the image inside the paragraph.
