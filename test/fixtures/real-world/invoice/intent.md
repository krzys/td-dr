---
feature: real-world
viewports: [600, 375]
maxDiffRatio: 0.005 # dropped box-shadow on the cards (W001) and sub-px text drift
maxDiffRatio375: 0.0065 # plus the painted tiles: px spacers, auto layout splits the narrowing by content
expect: compile
codes: []
status: active
---
Cartwell invoice email: hero photo (CSS background-image) with logo + nav and a serif headline over it,
Invoice Summary, two orange Pay Now buttons, an invoice card, a customer-info card, three action tiles, dark footer.
Uses flex rows (space-between, centered, gap), flex: 1 columns, a 2x2 CSS grid, a flex-column hero,
border-radius cards/pills/circles, box-shadow, negative margins on the totals band, and <s> for the struck-through $10.
Must stay true: centered 600px column on lilac; headline stays over the hero image; prices and units right-aligned
against item names; from/bill-to and customer-info stay two equal columns; the three tiles stay equal width in one row;
footer logo left, social icons right.
Measured 0.0041 / 0.0059. Must stay true: the hero headline sits at the bottom of the photo, the 2x2 grid and the
three tiles keep their columns, the tiles are link boxes (not buttons), and on a phone nothing is wider than in the
source (the footer's social row overflows to 470px in both).
