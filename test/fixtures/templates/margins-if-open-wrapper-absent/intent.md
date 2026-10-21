---
feature: templates
template: [handlebars, liquid]
viewports: []
expect: compile
codes: [W003]
status: active
---
A block with `margin-bottom: 20px`, then a wrapper without padding or margin holding an `if` banner with no margin and a block with `margin-top: 16px`.
With the banner absent, the 16px collapses through the wrapper with the 20px above (20px gap in the browser). Padding inside the wrapper
would make 36px, so W003 is reported instead of a silent approximation.
