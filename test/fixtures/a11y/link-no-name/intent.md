---
feature: a11y
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W015]
status: active
---
An icon link whose only image has alt="" (the screen reader can only announce the URL), next to an icon link
named by aria-label and a link whose text is a merge tag, which both count as named.
Must stay true: exactly one W015, pointing at the first link; the output is unchanged by the lint.
