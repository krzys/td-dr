---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: diagnostic
codes: [E017]
status: active
---
A ::before label whose text changes under 480px. Head rules can't change text, so the narrow screen is dropped.
Must stay true: E017 for the max-width 480px rules quoting "Desktop offer: " and "Mobile offer: " at the paragraph
(line 10); the base keeps the desktop text and there are no head rules. Before the check the narrow padding was
applied and the text change was silently lost.
