---
feature: target-lint
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I003]
status: active
---
Centred call-to-action button with a darker background on :hover. A subject :hover rule is only evaluated in a hover
environment, so the base compile is silent about it and the resting style is what gets sent. Must stay true: the button
compiles at its resting colours and width, and the :hover rule does not leak into the base output; it comes out as a
class on the button's cell and a `.t-0:hover` rule in the head.
