---
feature: radius
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Five 32x32 avatars in a row, each with border-radius: 50% and a 2px white border, on a light card. No overlap.
Must stay true: every avatar is a circle (50% of the 36px border box, 18px), the five sit side by side at the left, and no warning is raised for the percentage because the size is known.
