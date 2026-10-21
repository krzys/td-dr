---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A chain per item inside a list: for each `line`, `data-email-if="line.backorder"` / `-else-if="line.sku == promo.sku && !line.gift"`
/ `-else` notes under the item, and an inline chain on the price (`line.free` / else).
Must stay true: the chain repeats with the item; inside the loop Handlebars reads `line.*` off the variable and the root
field as `@root.promo.sku`, Liquid reads both as they are. Both data sets match the preview.
