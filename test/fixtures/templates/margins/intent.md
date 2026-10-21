---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Block flow with margins around constructs: an `if` banner with `margin: 0 0 16px`, a list whose items have `margin-bottom: 8px`
(one side only), and plain paragraphs without margins around them.
Must stay true: margins of a block inside a construct stay on it, so a banner or list that the ESP leaves out takes its
spacing with it. props.json shows both, props.bare.json neither.
