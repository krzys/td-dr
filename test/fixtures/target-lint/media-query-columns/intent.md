---
feature: target-lint
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Two feature blurbs that stack on phones and sit side by side on wider screens, driven by an @media (min-width: 480px)
rule. The compiler evaluates @media against the desktop environment, so the min-width rule applies in the base output
(columns at 50%). Must stay true: the base output carries the 50% width; the phone range (up to 479px) is its own compile and the
columns' tables get a class whose rule puts the width back to 100% there.
