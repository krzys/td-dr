---
feature: stylesheets
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I003]
status: active
---
Short welcome email under a Tailwind v4 preflight-style reset: `:host`, `::file-selector-button`, `::placeholder`,
`::backdrop`, `::-webkit-*`, `:-moz-*`, `::before/::after` without content, and nested @supports inside a placeholder
rule. Must stay true: the reset compiles with no warnings (the I003 is the reset's `padding: 0` carried on the inline
`<a>` and `<small>`), `*` in a list with pseudo-elements still zeroes margins,
and `html` in `html, :host` still sets the font and line-height.
