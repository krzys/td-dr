---
feature: flex-wrap
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W003]
status: active
maxDiffRatio375: 0.004 # px gutters beside % shares: the shares are exact at 600 and drift slightly narrower on a phone, ~0.003
---
Two 48% border-box columns with a 14px gap (about 4%) in a wrapping row.
Must stay true: the columns sit side by side at 600px and stay side by side at 375px (the % columns keep their share of the line
instead of stacking). Outlook's ghost cells are the px widths at 600px. W003 for the ragged painted heights, and W003 that the
source stops sharing the line below 364px (a 360px or 320px phone stacks the source but not the output).
