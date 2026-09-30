---
feature: real-world
viewports: [600, 375]
maxDiffRatio: 0.002
maxDiffRatio375: 0.003 # the portraits in the black band round to whole px differently from the flex row
expect: compile
codes: []
status: active
---
Linnet Black Friday sale email: a centered 600px column on a slate page background.
Dark hero (CSS background-image) with logo, centered nav, a giant "40%" next to terms text, "OFF" offset right, and promo copy with CLOTH40 highlighted.
2x2 product grid (flex-wrap + row/column gap): rounded grey image tiles, name left and blue price right on one baseline, category below; centered Shop Now button with arrow icon.
Black "30% OFF / NEW ARRIVALS" band: portraits flush to the left and right edges, centered copy and yellow button between them (space-between).
Benefits block: heading left, two portraits right, then three equal-width icon cards; footer on a linear gradient with a repeating logo strip, nav, social icons, unsubscribe line and logo.
The output must keep column widths, side-by-side rows, rounded corners and colors; the hero text must stay over the photo.
Measured 0 / 0.0026. Must stay true: the email is 375px wide on a phone (no row widens it), the product grid
stays two-up, and "OFF" stays right-aligned under the 40%.
