---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.01 # the buttons keep their 240px basis while the source grows them to 300px, ~0.0092
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.032 # stacked buttons keep the basis width where the source fills the line, ~0.0305
---
Two rounded <a> buttons as flex: 1 1 240px wrap items. Their columns grow to 300px each, but a button keeps its basis width so Outlook still gets VML with its rounded corners (v:roundrect 240px). W003s: the button size estimate and 'a button in a growing wrapping item keeps its basis width'.
