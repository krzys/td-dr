---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
Photo background with no height. VML needs a px height (docs/support.md#vml-background-images: warn and skip rather than guess), so Outlook gets the
colour only and W001 says to set a px min-height. Other clients paint the photo.
