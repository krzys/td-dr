// Builds a static gallery of every active `expect: compile` fixture. Run: pnpm gallery
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compile, preview, type Diagnostic } from "../src/index.ts";
import { fixtureOptions, isActive, loadFixtures } from "../test/harness/fixture-runner.ts";
import { expand, templateDialects, tokenize } from "../test/harness/template-fixture.ts";

const RESET = "<style>body{margin:0}html{-webkit-text-size-adjust:100%}</style>";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Anything without an <html> tag is treated as a body fragment.
const wrap = (html: string): string =>
  /<html[\s>]/i.test(html)
    ? html
    : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;

const withReset = (html: string): string => {
  const w = wrap(html);
  if (/<head(\s[^>]*)?>/i.test(w)) return w.replace(/<head(\s[^>]*)?>/i, (m) => m + RESET);
  return w.replace(/<html[^>]*>/i, (m) => `${m}<head>${RESET}</head>`);
};

// Fixture images live on the reserved img.example host (/<w>x<h>/…): the gallery page draws a grey
// box of that size in their place, as the visual harness does. The files in emails/ keep the URLs.
const PLACEHOLDER = /https:\/\/img\.example\/(\d+)x(\d+)[^"')\s]*/g;
const placeholders = (html: string): string =>
  html.replace(PLACEHOLDER, (_m, w: string, h: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#c8c8cc"/></svg>`)}`,
  );

const frame = (html: string): string =>
  `<iframe sandbox="allow-same-origin" loading="lazy" srcdoc="${esc(withReset(placeholders(html)))}"></iframe>`;

const diagRows = (ds: Diagnostic[]): string =>
  ds.length === 0
    ? `<p class="none">No diagnostics.</p>`
    : `<ul class="diags">${ds
        .map(
          (d) =>
            `<li class="${esc(d.severity)}"><code>${esc(d.code)}</code> <b>${esc(d.severity)}</b> ${esc(d.message)}${
              d.loc ? ` <span class="line">line ${d.loc.line}</span>` : ""
            }</li>`,
        )
        .join("")}</ul>`;

const CSS = `
:root{--bg:#fff;--fg:#1c1c1e;--muted:#6b6b70;--line:#d8d8de;--card:#f6f6f8;--err:#b3261e;--warn:#8a5a00}
@media(prefers-color-scheme:dark){:root{--bg:#161618;--fg:#ececf0;--muted:#9a9aa2;--line:#35353b;--card:#1f1f23;--err:#ff8a80;--warn:#ffc266}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header h1{font-size:18px;margin:0}
header .count{color:var(--muted)}
.toggle button{font:inherit;padding:4px 12px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.toggle button[aria-pressed=true]{background:var(--fg);color:var(--bg)}
main{padding:0 16px 48px;max-width:1500px;margin:0 auto}
h2{margin:32px 0 8px;font-size:20px;border-bottom:1px solid var(--line);padding-bottom:4px}
article{margin:16px 0;padding:12px;border:1px solid var(--line);background:var(--card);border-radius:6px}
article h3{margin:0 0 4px;font-size:16px}
article h3 a{font-size:13px;font-weight:400;margin-left:8px}
.desc{margin:0 0 8px;color:var(--muted)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pane h4{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
iframe{width:100%;height:480px;border:1px solid var(--line);background:#fff;display:block}
.w600 iframe{max-width:600px}.w375 iframe{max-width:375px}
.diags{margin:8px 0 0;padding-left:18px}
.diags li.error{color:var(--err)}.diags li.warning{color:var(--warn)}
.line,.none{color:var(--muted)}
a{color:inherit}
@media(max-width:900px){.pair{grid-template-columns:1fr}}
`;

const JS = `
const b=document.querySelectorAll('.toggle button');
b.forEach(x=>x.addEventListener('click',()=>{
  b.forEach(y=>y.setAttribute('aria-pressed',String(y===x)));
  document.body.classList.remove('w600','w375');
  document.body.classList.add('w'+x.dataset.w);
}));
`;

export const buildGallery = (outDir: string): { count: number; index: string } => {
  const fixtures = loadFixtures().filter((f) => isActive(f) && f.intent.expect === "compile");
  const emailsDir = join(outDir, "emails");
  rmSync(emailsDir, { recursive: true, force: true });
  mkdirSync(emailsDir, { recursive: true });

  const groups = new Map<string, string[]>();
  for (const f of fixtures) {
    // a template shows as the ESP would send it: first dialect, filled with props.json
    const dialect = templateDialects(f)?.[0];
    const compiled = dialect ? compile(tokenize(f.input), { ...fixtureOptions(f), template: dialect }) : compile(f.input, fixtureOptions(f));
    const { diagnostics } = compiled;
    const html = dialect ? expand(compiled.html, dialect, f.props ?? {}) : compiled.html;
    const source = dialect ? preview(tokenize(f.input), f.props ?? {}) : f.input;
    const file = `${f.feature}--${f.name}.html`;
    writeFileSync(join(emailsDir, file), html);
    const entry = `<article id="${esc(f.feature)}--${esc(f.name)}">
<h3>${esc(f.name)}<a href="emails/${esc(file)}">emails/${esc(file)}</a></h3>
<p class="desc">${esc(f.intent.description ?? "")}</p>
<div class="pair">
<div class="pane"><h4>Source</h4>${frame(source)}</div>
<div class="pane"><h4>Compiled</h4>${frame(html)}</div>
</div>
${diagRows(diagnostics)}
</article>`;
    const list = groups.get(f.feature) ?? [];
    list.push(entry);
    groups.set(f.feature, list);
  }

  const sections = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([feature, entries]) => `<section><h2>${esc(feature)} (${entries.length})</h2>${entries.join("\n")}</section>`)
    .join("\n");

  const index = join(outDir, "index.html");
  writeFileSync(
    index,
    `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>td;dr gallery</title><style>${CSS}</style></head>
<body class="w600">
<header><h1>td;dr gallery</h1><span class="count">${fixtures.length} fixtures</span>
<span class="toggle">Width <button data-w="600" aria-pressed="true">600</button><button data-w="375" aria-pressed="false">375</button></span></header>
<main>
${sections}
</main>
<script>${JS}</script>
</body></html>
`,
  );
  return { count: fixtures.length, index };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { count, index } = buildGallery(resolve(import.meta.dirname, "../gallery"));
  console.log(`gallery: ${count} fixtures -> ${index}`);
}
