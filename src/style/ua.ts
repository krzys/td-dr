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
center { text-align: center; }
th { font-weight: bold; text-align: center; }
pre { font-family: monospace; white-space: pre; }
ul { list-style-type: disc; }
ol { list-style-type: decimal; }
em, i { font-style: italic; }
a { color: #0000ee; text-decoration: underline; }
hr { margin: 0.5em auto; border-width: 1px; border-style: inset; color: gray; overflow: hidden; }
`;
