---
feature: templates
template: [handlebars, liquid]
expect: diagnostic
codes: [E013, E006]
status: active
---
A placeholder as a length (`padding`), which the passes need to resolve widths and spacing.
Must stay true: E013 at the placeholder's line and column in both dialects (only whole colour values may be fields); the
style stage also rejects the value it got (E006).
