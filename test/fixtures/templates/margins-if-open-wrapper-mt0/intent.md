---
feature: templates
template: [handlebars, liquid]
viewports: [] # no pixel diff: the extra margin is the loss W003 reports
expect: compile
codes: [W003]
status: active
---
A block with `margin-bottom: 20px`, then a wrapper with no margin or padding whose first child is an `if` banner with `margin-top: 24px`. Absent, the 20px stays; present, the banner's 24px collapses through the wrapper (24px gap). Padding inside could not give both, so W003 is reported.
