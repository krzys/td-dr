---
feature: image
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
Promo tile where the image has no width, height, or CSS width at all, and is wrapped in a block-level link.
The compiler does not invent a width, so it warns that Outlook needs a width (W001 for now, new code once assigned)
and the image renders at its intrinsic size. Making every no-dimension image fluid would stretch small images such
as logos and icons to fill the container.
Must stay true: the whole image is clickable through the link with no border, and the heading sits 12px below the image.
