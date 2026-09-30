---
feature: templates
template: [handlebars, liquid]
viewports: [] # no pixel diff: the margin below the banner is the loss W003 reports
expect: compile
codes: [W003]
status: active
---
An `if` banner with `margin-bottom: 24px` as the last child of a wrapper with no padding and `margin-bottom: 10px`,
followed by a sibling with `margin-top: 20px`. The wrapper's margin collapses with the sibling's and the banner's,
which table padding cannot do for a conditional block: W003 says so.
