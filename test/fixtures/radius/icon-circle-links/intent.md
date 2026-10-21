---
feature: radius
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Four 56x56 social links (a with width, height, background, border-radius: 50%, flex-centred) each around a 24x24 icon.
Must stay true: each link comes out as a 56px circle with the background colour and the icon centred in it, 18px apart, left aligned inside the 24px padding. No dropped width/height or radius warning. The W003 (shorter items won't stretch) is a false positive: the four circles are equal height.
