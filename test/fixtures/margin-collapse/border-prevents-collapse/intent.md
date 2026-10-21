---
feature: margin-collapse
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
Price summary panel with a 2px bottom border. The last paragraph's 16px margin-bottom must not collapse through the
border, so the gap sits inside the panel above the rule. The panel has no bottom margin, so the note's 24px margin-top
is the only gap below the rule.
Must stay true: the rule is 16px below the last price line, and the note sits 24px below the rule.
