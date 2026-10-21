---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
An else chain inside text: three `<b>` with `data-email-if` / `-else-if` / `-else` in a paragraph (whitespace between
them), a greeting with an inline `<tddr-if test="user.first">` / `<tddr-else>`, and a link whose text is a chain.
Must stay true: elements on a text line are not lowered; the markers sit right around the elements, the whitespace
between the branches is dropped (in the preview too), and the line reads the same in every data set.
