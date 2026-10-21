---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001]
status: active
---
Colours from data (docs/templates.md#colours-from-data): a painted card whose background and text colour are fields, a top border with a field
colour, and a rounded bulletproof button whose background and border are fields. A translucent strip inside the
card sits over the field background.
Must stay true: each field is written whole into `style`, the cell's `bgcolor`, the borders and the button's VML
`fillcolor` / `strokecolor`; the text colour is inherited by the card's children; the translucent strip is kept as written with W001
(its backdrop isn't known); both data sets render the same as the preview.
