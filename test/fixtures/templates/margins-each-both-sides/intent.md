---
feature: templates
template: [handlebars, liquid]
viewports: [] # no pixel diff: the doubled gap between items is the loss W003 reports
expect: compile
codes: [W003]
status: active
---
A list whose items have `margin: 8px 0`. In the browser neighbouring items are 8px apart; the repeated rows
would be 16px apart (bottom of one plus top of the next), so W003 says the margins add.
