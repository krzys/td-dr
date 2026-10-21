---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
A gradient overlay plus a photo in one comma-layered `background:` shorthand (the Linnet hero idiom). Today
style/shorthands.ts drops both layers and the colour with no diagnostic. Needs the shorthands fix (comma-split layers
into background-image / -size / -position, see the report); then the layers are kept as CSS and W001 says Outlook gets
no photo (several layers).
