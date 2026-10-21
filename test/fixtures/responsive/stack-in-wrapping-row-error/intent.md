---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E017]
status: active
---
A row inside the item of a wrapping row that stacks under 480px.
Must stay true: rows inside a wrapping row keep today's behaviour (a wrapping row stacks by itself), so the stack is E017 for the max-width 480px rules.
