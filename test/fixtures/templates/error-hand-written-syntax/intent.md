---
feature: templates
template: [handlebars, liquid]
expect: diagnostic
codes: [E012]
status: active
---
Block syntax written by hand: a Handlebars if / unless pair in an href and a Liquid if in text. Each only works in one dialect.
Must stay true: E012 per line with a hint to use `data-email-if` / `-unless` twins; the text is written so the ESP shows
it as typed. Plain `{{ like this }}` is literal text and no error.
