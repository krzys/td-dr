---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001, I003]
status: active
---
Stylesheet with @supports blocks td;dr answers for the email: a Tailwind-style nested `@supports (color: color-mix())`
inside a rule (applied, since colour functions are lowered), a `not`/`or` condition that is true, Tailwind's
Safari/Firefox sniff that is false, and `(display: flex) and selector(...)` that is true. Must stay true: those apply or
skip silently, and only the undecidable `(margin-trim: block)` block is skipped with one W001 pointing at it. The I003 is the badge's inline-block padding.
