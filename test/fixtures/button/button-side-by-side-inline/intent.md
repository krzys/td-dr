---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Two inline-block button-styled links in the same paragraph-like run.
Pinned behaviour: when a run holds more than one element it stays an inline run, so the links are NOT bulletproofed (they keep their inline padding and background, which Outlook classic ignores) and each gets a W003 saying so. Only a link that stands alone in its block becomes a button.
Must stay true: both links sit side by side on one line with their backgrounds and padding.
