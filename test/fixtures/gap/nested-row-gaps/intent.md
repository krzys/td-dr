---
feature: gap
viewports: [600, 375]
maxDiffRatio: 0.0075
expect: compile
codes: []
status: active
---
Order line card: outer row with 24px column-gap (image, text block, price), and an inner meta row with 8px column-gap.
Must stay true: the outer 24px gutters and the inner 8px gutters are independent, the price stays right-aligned at the card's right padding, and the meta items stay on one line at 600.
At 375 the meta row may wrap its last item to the next line, but the 8px spacing between items is kept.
Tolerance 0.0075 (measured 0.0064 at 375): the content-sized meta row wraps; table layout shrinks the 4px spacer cells and sizes the price column differently from flex, so the items sit up to 4px closer.
