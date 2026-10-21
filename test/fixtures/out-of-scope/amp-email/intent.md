---
feature: out-of-scope
viewports: [600]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E008]
status: active
---
An AMP for Email message: the ⚡4email html attribute, the AMP runtime and carousel scripts, the amp4email boilerplate
style and an amp-carousel of amp-img. td;dr compiles the text/html part, and AMP goes in its own text/x-amp-html part.
Must stay true: the input is refused with one E008 whose hint says so, and the boilerplate's body{visibility:hidden} never
reaches an element, so the HTML that allow mode still writes is visible.
