---
feature: templates
template: [handlebars, liquid]
viewports: [] # no pixel diff: the extra margin of the banner is the loss W003 reports
expect: compile
codes: [W003]
status: active
---
A block with `margin-bottom: 20px`, then a wrapper without padding and `margin-top: 10px` whose first child is an `if`
banner with `margin-top: 24px`. The wrapper's margin collapses again with the block above, so the extra the banner
adds cannot be put in padding from inside the wrapper: W003 says so instead of an approximation.
