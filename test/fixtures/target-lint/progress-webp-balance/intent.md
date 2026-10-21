---
feature: target-lint
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W005]
status: active
---
Fundraising update with a WebP banner, a balanced headline and a progress bar. None of these has a fallback the
compiler can write: most clients drop `<progress>` and show its fallback text, Outlook on Windows shows no WebP image,
and `text-wrap` is ignored widely. Each is kept as written and reported on input from the caniemail data. Must stay
true: the output renders like the input where they are supported, and there is one W005 each for `<progress>`, the
WebP image and `text-wrap`.
