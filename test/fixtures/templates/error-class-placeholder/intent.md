---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E013]
status: active
---
A class that the ESP fills in, next to a class no stylesheet uses.
Must stay true: E013 at the span, with a hint to write one copy per look under a condition (td;dr inlines the
stylesheet when it builds, so no rule can follow a class filled in later); the placeholder class still stays in the class
attribute, and `badge`, which nothing selects, is still dropped.
