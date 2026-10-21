---
feature: dark-mode
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A white card on a paper-coloured page, with a body-level prefers-color-scheme: dark rule for the page colour and dark
rules for the card and the ink. The visual harness renders light only, so the dark rules are asserted in the golden.
Must stay true: the page colour is inline on the body and the page table (also as bgcolor); the dark block repaints the
body and the page table's class with the author's page colour, and the page table's class has its [data-ogsb] mirror;
the body itself has no class; the card and ink dark rules stay as before.
