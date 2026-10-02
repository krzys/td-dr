---
feature: responsive
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A mobile-only block holding a rounded CTA (VML for Outlook). Must stay true: the hidden block has no Outlook branch inside its [if !mso] guard, so Outlook shows none of it.
