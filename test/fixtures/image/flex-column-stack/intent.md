---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Product card whose 24px-padded content is a flex column with 12px gaps. The first image is full width (552px at 600),
the second is a fixed 160x160 image with attributes, and the text sits between and below them.
Must stay true: the wide image fills the column at both viewports, the 160px image stays 160px and is not stretched,
and all gaps are 12px.
