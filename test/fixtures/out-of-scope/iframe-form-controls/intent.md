---
feature: out-of-scope
viewports: [600]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E008]
status: active
---
A survey email with an embedded iframe (its srcdoc holds a script) and a form with a number input, a hidden input and a
submit button. Mail clients load no embedded documents and disable or strip forms. Must stay true: the iframe, its
srcdoc and the controls are removed in every mode, each reported as E008 (the hidden input as I002), and the form's text
is kept.
