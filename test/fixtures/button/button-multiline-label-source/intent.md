---
feature: button
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
Rounded inline-block button whose label sits indented on its own source line with runs of spaces.
Must stay true: the button looks like the source in browsers, and the Outlook VML width is estimated from the
collapsed label ("Manage my account", 17 characters), about 211px, not from the raw whitespace. W003 reports the estimate.
