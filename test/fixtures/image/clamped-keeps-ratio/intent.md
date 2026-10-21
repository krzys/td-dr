---
feature: image
viewports: [600]
maxDiffRatio: 0.016 # measured 0.0153: the columns are scaled down to 137px (W003), so the squares are 3px smaller than the source's 140px ones and shift along
expect: compile
codes: [W001, W003, W004]
status: active
---
A row of four square photos, flex: 0 0 140px with a 12px gap, that is 12px wider than its 584px box. The source
keeps the items whole and its overflow:hidden cuts the last one; the output scales the columns down to 137px
(W003, overflow dropped W001) and each image's max-width:100% clamps it to its column (W004).
Must stay true: each clamped image keeps its ratio: 137px wide and 137px tall in every client (the height
follows the clamp, the width attribute is the clamped width for Outlook); nothing is wider than 600.
Desktop only: at 375 the no-shrink row still keeps the output about 592px wide, which a phone lowering of such rows
(a separate fix) has to change first.
