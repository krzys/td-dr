---
feature: flex-wrap
viewports: [600] # at 375 the source shares one line (125 + 250) while the output stacks the 400px-capped grow item, the case the W003 names
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
`flex: 0 0 33.3333%` beside `flex: 1 1 100px` in a 600px wrapping row.
Must stay true: the third is 200px, the grow item takes the rest as a whole 400px (an integer max-width, never 400.0002), ghost cells 200 / 400 and ghost table 600.
