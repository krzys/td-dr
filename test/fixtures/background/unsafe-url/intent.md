---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I001]
status: active
---
Shipping card over a background colour whose shorthand also carries a javascript: image, a footer band with a vbscript:
background-image, and a stylesheet class using behavior, -moz-binding and expression().
Must stay true: no script URL, behavior, binding or expression() reaches the email (one I001 each); the javascript:
layer becomes none so the card keeps its colour as bgcolor/background-color, and the rest of each rule stays.
