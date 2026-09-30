---
feature: templates
template: [handlebars, liquid]
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A class that the ESP fills in, next to a class no stylesheet uses.
Must stay true: the placeholder class stays in the class attribute (dead-class removal can't judge a value it doesn't
know); `badge`, which nothing selects, is still dropped.
