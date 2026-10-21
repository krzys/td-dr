---
feature: responsive
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A template with a field in text, an each loop and an if block, plus rules that shrink the padding, recolour a span and
hide a hint under 480px.
Must stay true: the span gets its generated class, the hidden hint stays inside its if block (shown in the base, hidden
by a narrow rule), and the loop and if markers come out unchanged in both dialects.
