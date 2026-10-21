---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Email header logo sized only by CSS width: 160px, no width or height attributes, so the height is derived from the
intrinsic ratio of the placeholder file (160x48). The paragraph below it has an 8px top margin.
Must stay true: the logo is 160px wide at both viewports, it stays left-aligned inside the 24px padding, and the
paragraph is 8px below the logo bottom.

Tolerance 0.0025 (measured 0.0021): the source img is inline, so the browser leaves a ~4px baseline gap below it; the email emits display:block and the paragraph sits 4px higher.