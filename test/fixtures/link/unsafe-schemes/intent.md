---
feature: link
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I001]
status: active
---
Help text with https, mailto, tel and fragment links next to a vbscript: link, a javascript: link with a tab in the
scheme and a data:text/html link. Must stay true: only the allowed schemes keep their href; the others lose it (one I001
per scheme) and keep their text and inline link styling, so the paragraph looks the same.
