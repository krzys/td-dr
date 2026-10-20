---
feature: block-flow
viewports: [600, 375]
maxDiffRatio: 0.002
expect: compile
codes: []
status: active
---
The legacy align attribute on a div: browsers turn it into text-align for the line content and also place the div's own blocks, as -webkit-center and -webkit-right do. An inline image and a text line follow the text-align; a fixed-width box and a block image become aligned tables or cells, with the align attribute for Outlook.
Must stay true: the logo and the box are centred, the text and the badge sit at the right edge.
