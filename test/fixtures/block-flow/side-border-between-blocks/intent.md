---
feature: block-flow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Three paragraphs; the middle one has a 4px left border and padding. Must stay true: Alpha and Gamma start at the
left edge, not 2px in. The bordered paragraph gets a table of its own: a side border on a cell of the stack's
collapsed table would be shared with the column and push every sibling row in by half of it.
