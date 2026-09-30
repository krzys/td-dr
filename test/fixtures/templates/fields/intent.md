---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Placeholders (`{{order.id}}` in the input, written in each dialect's syntax in the output) in text, an href, a mailto href,
an image src and alt, a bulletproof button's href and the preheader.
Must stay true: the field survives lowering untouched in every one of those places; after the ESP fills it in with
props.json the email looks like the same source with the values typed in.
