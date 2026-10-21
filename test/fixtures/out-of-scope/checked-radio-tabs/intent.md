---
feature: out-of-scope
viewports: [600, 375]
maxDiffRatio: 0.018 # the tab label row is dropped (W001), so the panel moves up by its height, ~0.0173 at 375
expect: compile
codes: [W001, I002]
status: active
---
Activity summary with radio-button tabs: hidden inputs, `<label for>` tabs and `:checked ~` rules that show one panel
at a time. Inlined styles have no state and most clients ignore `:checked`, so only the initially checked state can be
sent. Must stay true: the week panel is shown as in the browser, the month panel is dropped, one W001 says the
`:checked` rules collapse to the initial state and counts the dropped block and labels, and the tab labels, which would switch
nothing, are dropped with the inputs (I002).
