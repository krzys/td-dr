---
feature: a11y
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I011]
status: active
---
An h2 followed by an h4, then an h3. There is no h1, which is fine.
Must stay true: one I011 on the h4; nothing for the missing h1.
