---
feature: real-world
viewports: [600, 375]
maxDiffRatio: 0.01 # dropped box-shadow under the hero photo (W001)
maxDiffRatio375: 0.026 # plus whole sections 1px off (fractional line heights round differently in cells) over grid-pattern backgrounds
expect: compile
codes: []
status: active
---
Larch "productivity issue" product newsletter: a centered 600px rounded card on a warm page.
Uses a peach linear-gradient hero, pill labels, pill CTAs (border-radius), flex rows with gap
(two alternating text/photo features, two quote columns, three blog cards, footer with space-between),
and CSS grid-line background patterns (repeating linear-gradients) on "Feature update" and the dark band.
Must stay true: columns sit side by side at 600px with their gaps, the feature-update row keeps
the photo on the left, images keep their sizes and rounded corners, buttons stay pill-shaped,
and the hero gradient and dark band background survive (or have a solid fallback colour).
Measured 0.0090 / 0.0241. Must stay true: the feature photos keep 176px (flex-shrink: 0), the three blog columns are
equal at both widths, and the pill labels sit on their parent's line.
