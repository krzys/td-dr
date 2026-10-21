---
feature: link
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: [I001]
status: active
---
An Outlook-only rule and note in an [if mso] comment, with an onclick on the VML, a javascript: link and a script, between
two paragraphs. Must stay true: the comment loses the handler, the bad href and the script (one I001 each), the VML rule and
the note's text and styling stay byte for byte, and the paragraphs other clients show are unchanged.
