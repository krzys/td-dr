// Just the browser defaults that affect layout decisions (Chromium's values).
export const UA_CSS = `
html, body, div, section, article, header, footer, main, nav, aside, figure, figcaption, details, summary,
p, h1, h2, h3, h4, h5, h6, ul, ol, li, dl, dt, dd, blockquote, pre, hr, address, center, form, table
  { display: block; }
li { display: list-item; }
table { display: table; }
head, style, script, link, meta, title, template { display: none; }
[hidden], dialog:not([open]), [popover] { display: none; } /* a popover is never open in email */
body { margin: 8px; } /* the analyzer ignores body margins; the shell owns them */
p, blockquote, ul, ol, dl, figure, pre { margin-top: 1em; margin-bottom: 1em; }
blockquote, figure { margin-left: 40px; margin-right: 40px; }
ul, ol { padding-left: 40px; }
h1 { font-size: 2em; margin-top: 0.67em; margin-bottom: 0.67em; font-weight: bold; }
h2 { font-size: 1.5em; margin-top: 0.83em; margin-bottom: 0.83em; font-weight: bold; }
h3 { font-size: 1.17em; margin-top: 1em; margin-bottom: 1em; font-weight: bold; }
h4 { margin-top: 1.33em; margin-bottom: 1.33em; font-weight: bold; }
h5 { font-size: 0.83em; margin-top: 1.67em; margin-bottom: 1.67em; font-weight: bold; }
h6 { font-size: 0.67em; margin-top: 2.33em; margin-bottom: 2.33em; font-weight: bold; }
strong, b { font-weight: bold; }
small { font-size: smaller; }
dd { margin-left: 40px; }
/* -webkit-*: the lines, and also the blocks inside, whatever their margins (inherit.ts) */
center, div:is([align="center" i], [align="middle" i]) { text-align: -webkit-center; }
div[align="left" i] { text-align: -webkit-left; }
div[align="right" i] { text-align: -webkit-right; }
div[align="justify" i] { text-align: justify; }
table[align="center" i] { margin-left: auto; margin-right: auto; }
th { font-weight: bold; text-align: center; }
pre { font-family: monospace; white-space: pre; }
ul { list-style-type: disc; }
ol { list-style-type: decimal; }
:is(ul, ol) :is(ul, ol) { margin-top: 0; margin-bottom: 0; }
:is(ul, ol) ul { list-style-type: circle; }
:is(ul, ol) :is(ul, ol) ul { list-style-type: square; }
/* the type attribute, a presentational hint: ol's is case-sensitive, ul's and li's aren't */
:is(ol, li)[type="1"] { list-style-type: decimal; }
:is(ol, li)[type="a" s] { list-style-type: lower-alpha; }
:is(ol, li)[type="A" s] { list-style-type: upper-alpha; }
:is(ol, li)[type="i" s] { list-style-type: lower-roman; }
:is(ol, li)[type="I" s] { list-style-type: upper-roman; }
:is(ul, li)[type="disc" i] { list-style-type: disc; }
:is(ul, li)[type="circle" i] { list-style-type: circle; }
:is(ul, li)[type="square" i] { list-style-type: square; }
:is(ul, li)[type="none" i] { list-style-type: none; }
em, i { font-style: italic; }
a { color: #0000ee; text-decoration: underline; }
hr { margin: 0.5em auto; border-width: 1px; border-style: inset; color: gray; overflow: hidden; }
`;
