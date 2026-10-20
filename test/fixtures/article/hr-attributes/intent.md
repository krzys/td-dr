---
feature: article
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Rules styled by the legacy `<hr>` attributes only: `size`, `color`, `noshade`, `width` and `align`, plus one where CSS overrides `color`.
A width of 0 is 1px, as in Chromium. A percentage width is measured border-box, so those rules are a couple of pixels narrower than in browsers.
Must stay true: each rule keeps its thickness, colour, width and side as browsers draw them; the last one is the 2px green line its CSS asks for.
