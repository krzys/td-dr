---
feature: margin-collapse
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E005]
status: active
---
Order item list that uses a negative margin-top (-12px) on item B. Adjacent negative and positive margins
combine as max(positive) + min(negative) rather than simple addition or max, and the compiler does not model
that yet, so the input is out of scope and must produce a diagnostic with the source location of item B's rule.
Expected code is not yet assigned; proposed in the report.
