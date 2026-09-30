---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.004
maxDiffRatio375: 0.006
expect: compile
codes: [I003]
status: active
---
Vue-scoped-style newsletter written with CSS nesting: `&[data-v-*]` next to nested children, `& >` and implicit
descendant children, a compound `&.featured` with its own nested rules, a nested selector list, everything partly inside
@layer, and declarations after a nested rule. Must stay true: every nested rule lands on its elements with no warnings (the I003 is the tag's inline-block padding),
the featured card's bigger title beats the plain one, and `text-align`/`color` written after the nested rule still apply.
Tolerance 0.004/0.006 (measured 0.0032/0.0052): the bordered card renders 1px narrower on the left, exactly as the
same CSS written flat does, so it's the emitter's bordered-cell width, not nesting.
