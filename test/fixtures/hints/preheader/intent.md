---
feature: hints
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
A data-email="preheader" element with placeholder text, odd whitespace and a hidden style, placed before the content.
Must stay true: the element leaves the body; the output starts with a hidden preheader div (display:none, mso-hide:all)
holding the text with whitespace collapsed and {{first_name}} verbatim, followed by zwnj/nbsp filler. Nothing visible changes.
