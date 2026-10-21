---
feature: dark-mode
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W017]
status: active
---
A logo inlined as a PNG with an alpha channel, on a white card.
Must stay true: W017 on the img (dark ink on a background a forced-dark client will darken); the image is untouched.
