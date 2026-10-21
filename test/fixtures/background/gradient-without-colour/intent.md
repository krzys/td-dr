---
feature: background
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [W001, W005]
status: active
---
Dark gradient footer from the Linnet sale, with white text and no background-color.
Must stay true: the footer stays readable everywhere. The cell gets the gradient's first colour as bgcolor and
background-color, so clients without gradient support (Outlook) show dark, never white text on white. W001 names the
first colour Outlook shows; W005 says which target clients don't paint the gradient.
