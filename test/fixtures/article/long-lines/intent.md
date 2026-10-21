---
feature: article
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I013]
status: active
---
A notice with long paragraphs, a long tracked link and a preformatted address. Inlined styles make the first and last paragraphs single lines over a thousand bytes, which a mail server would break at byte 998 wherever it falls. The output is wrapped at 900 bytes where a line break means what was there, so it renders exactly as if it were not wrapped.
Must stay true: no output line is over 998 bytes; the link's href is whole; the address keeps its line break and its run of spaces; the paragraphs read as they were written.
