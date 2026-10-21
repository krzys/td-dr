---
feature: templates
template: [handlebars, liquid]
viewports: []
expect: compile
codes: [W003]
status: active
---
A wrapper without padding or margin holding a block with `margin-bottom: 16px` and an `each` list with no margin, then a block with `margin-top: 20px`.
With 0 items the 16px collapses through the wrapper's bottom with the 20px (20px gap); padding inside would make 36px, so W003 is reported.
