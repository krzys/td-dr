---
feature: out-of-scope
viewports: [600, 375]
maxDiffRatio: 0.005
expect: compile
codes: [W001, I002]
status: active
---
FAQ accordion with checkboxes: hidden inputs, `<label for>` wrapping each question heading and `:checked ~` rules that
open an answer. Inlining keeps the initial state, so the open answer is sent and the closed one is dropped. Must stay
true: both questions are shown as in the browser, since a label holding a heading is content, not a tab; the open
answer is kept and the closed one is dropped; one W001 counts the one dropped block and no label.
