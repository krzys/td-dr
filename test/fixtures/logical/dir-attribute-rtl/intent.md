---
feature: logical
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
The same kind of right-to-left notice, but the direction comes from the dir attribute alone (no direction in CSS), with an
inner dir="ltr" paragraph. Must stay true: the blue bar and the 40px padding are on the right, the 8px padding on the left;
the text of the rtl parts is right-aligned and the dir="ltr" paragraph is left-aligned.
