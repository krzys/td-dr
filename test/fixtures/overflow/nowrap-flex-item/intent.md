---
feature: overflow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
---
A fixed 100px flex item (grey, overflow: hidden, white-space: nowrap) holding a line wider than itself, beside a second item.
Must stay true: the clip is emitted (fixed-layout inner table, overflow:hidden cell) so the row never grows past the email at 600 or 375; never W003 without a clip. Outlook ignores overflow, so W003 says the line may wrap or stretch there.
