// The Fields view: both frames show their unfilled form, every {{ }} / {% %} drawn as a chip.

const CHIP_CSS =
  "<style>.tddr-chip{font:500 .8em ui-monospace,Menlo,Consolas,monospace;color:#a8327e;background:rgba(168,50,126,.12);border-radius:3px;padding:1px 4px;white-space:nowrap}</style>";
const esc = (/** @type {string} */ t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// `offsets`: html is the template itself, so a chip can say where its text is in it
/** @param {string} html */
export const chipify = (html, offsets = false) => {
  const out = html.replace(/(<[^>]*>)|(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/g, (_m, tag, field, at) =>
    tag ? tag : `<span class="tddr-chip"${offsets ? ` data-tddr-f="${at}"` : ""}>${esc(field)}</span>`,
  );
  return /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${CHIP_CSS}</head>`) : CHIP_CSS + out;
};

/** @typedef {{ open: string, close?: string, kind?: "if" | "elseif" | "else" }} Control */

// The author's markup holds <tddr-if> / <tddr-each> elements and data-email-* attributes that a
// browser draws as nothing; write them as the block tags they stand for, so Source reads like the template.
/** @param {Element} el @returns {Control | null} */
const control = (el) => {
  const g = (/** @type {string} */ n) => el.getAttribute(n);
  const tag = el.localName;
  const as = g("data-email-as") ?? g("as");
  const each = (/** @type {string | null} */ of) => [`{{#each ${of}${as ? ` as |${as}|` : ""}}}`, "{{/each}}"];
  if (tag === "tddr-if") return { open: `{{#if ${g("test")}}}`, kind: "if" };
  if (tag === "tddr-else-if") return { open: `{{else if ${g("test")}}}`, kind: "elseif" };
  if (tag === "tddr-else") return { open: "{{else}}", kind: "else" };
  if (tag === "tddr-each") return { open: each(g("of"))[0] ?? "", close: "{{/each}}" };
  /** @type {Control} */
  const out = { open: "", close: "" };
  const each0 = g("data-email-each");
  if (each0 !== null) {
    const [o = "", c = ""] = each(each0);
    out.open += o;
    out.close = c + out.close;
  }
  /** @type {[string, (v: string | null) => string, NonNullable<Control["kind"]>][]} */
  const blocks = [
    ["data-email-if", (v) => `{{#if ${v}}}`, "if"],
    ["data-email-unless", (v) => `{{#unless ${v}}}`, "if"],
    ["data-email-else-if", (v) => `{{else if ${v}}}`, "elseif"],
    ["data-email-else", () => "{{else}}", "else"],
  ];
  for (const [attr, text, kind] of blocks) {
    if (g(attr) === null) continue;
    out.open += text(g(attr));
    out.kind = kind;
  }
  return out.open ? out : null;
};

/** @param {string} html */
export const blockify = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const isElse = (/** @type {Element | null} */ el) => {
    const c = el && control(el);
    return c?.kind === "elseif" || c?.kind === "else";
  };
  for (const el of [...doc.body.querySelectorAll("*")]) {
    const c = control(el);
    if (!c) continue;
    el.before(c.open);
    // a branch chain closes after its last branch
    const chain = c.kind && c.kind !== "if" ? true : c.kind === "if";
    const last = chain && !isElse(el.nextElementSibling);
    const close = (c.close ?? "") + (c.kind && last ? "{{/if}}" : "");
    if (close) el.after(close);
  }
  return `<!doctype html>${doc.documentElement.outerHTML}`;
};
