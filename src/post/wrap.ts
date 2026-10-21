// The last step: lines over WRAP_LINE_BYTES are broken where a line break means what was there
// (docs/support.md#size-limits). That is whitespace between attributes or in text (not inside
// <pre>, white-space: pre* or an Outlook-only conditional), and after a declaration in a style
// attribute or a <style>. Never inside another attribute value, a url(), a comment, a conditional
// marker or a {{ }} / {% %} tag.
import type { Ctx } from "../ctx.ts";
import { byteLength, formatBytes, SMTP_LINE_BYTES, WRAP_LINE_BYTES } from "../limits.ts";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
// pre, pre-wrap, pre-line and break-spaces render a line break
const KEEPS_SPACE = /(?:^|;)\s*white-space\s*:\s*(?:pre|break-spaces)/i;
// <!--[if mso]> hides what follows from every other client; <!--[if !mso]><!--> shows it
const CONDITION = /<!--\[if [^\]]*\]>(<!-->|<!--\s*-->)?/y;
const SPACE = /[ \t\n\r\f]/;
const ENTITY_QUOTE = /&(?:(quot|#0*34|#x0*22)|apos|#0*39|#x0*27);/iy;

// a lone surrogate counts 2, so a pair is the 4 bytes UTF-8 gives it
const utf8 = (c: number): number => (c < 0x80 ? 1 : c < 0x800 || (c >= 0xd800 && c <= 0xdfff) ? 2 : 3);

const tooLong = (html: string, limit: number): boolean => html.split("\n").some((l) => l.length * 3 > limit && byteLength(l) > limit);

type Break = { at: number; replace: boolean; bytes: number }; // replace: the whitespace at `at` becomes the break

export const wrapLines = (html: string, ctx: Ctx, limit = WRAP_LINE_BYTES): string => {
  if (!tooLong(html, limit)) return html;
  const n = html.length;
  const breaks: Break[] = [];
  const over: Array<{ row: number; bytes: number }> = [];
  let i = 0;
  let row = 1;
  let bytes = 0; // on the current output line
  let safe: Break | undefined;
  let hidden = 0; // inside <!--[if mso]> … <![endif]-->
  const open: Array<{ name: string; keeps: boolean }> = [];
  let keeps = 0;

  const endLine = (length: number): void => {
    if (length > SMTP_LINE_BYTES) over.push({ row, bytes: length });
    row++;
  };
  const step = (to: number): void => {
    for (; i < to && i < n; i++) {
      const c = html.charCodeAt(i);
      if (c === 10) {
        endLine(bytes);
        bytes = 0;
        safe = undefined;
        continue;
      }
      bytes += utf8(c);
      if (bytes > limit && safe) {
        breaks.push(safe);
        endLine(safe.bytes);
        bytes -= safe.bytes + (safe.replace ? 1 : 0);
        safe = undefined;
      }
    }
  };
  const mark = (replace: boolean): void => {
    if (bytes > 0) safe = { at: i, replace, bytes };
  };
  const templateEnd = (from: number): number | undefined => {
    if (html.startsWith("{%", from)) return end(html.indexOf("%}", from + 2), 2);
    if (!html.startsWith("{{", from)) return undefined;
    let e = end(html.indexOf("}}", from + 2), 2);
    while (html[e] === "}") e++; // {{{ raw }}}
    return e;
  };
  const end = (at: number, length: number): number => (at < 0 ? n : at + length);

  // declarations end at ; (and rules at } in a sheet) outside quotes and brackets
  const css = (to: number, sheet: boolean): void => {
    let depth = 0;
    let quote = "";
    while (i < to) {
      const t = templateEnd(i);
      if (t !== undefined) {
        step(Math.min(t, to));
        continue;
      }
      // in an attribute a CSS string can be quoted with &quot; or &#39;
      ENTITY_QUOTE.lastIndex = i;
      const entity = sheet ? null : ENTITY_QUOTE.exec(html);
      const c = entity ? (entity[1] ? '"' : "'") : html[i]!;
      if (quote) {
        if (c === "\\") step(i + 1);
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth = Math.max(0, depth - 1);
      step(i + (entity ? entity[0].length : 1));
      // inside a conditional the comment's text is compared as written, so only whitespace becomes a break
      if (!quote && depth === 0 && !hidden && (c === ";" || (sheet && c === "}"))) mark(false);
    }
  };

  const tag = (): void => {
    const closing = html[i + 1] === "/";
    let j = i + (closing ? 2 : 1);
    while (j < n && !/[\s/>]/.test(html[j]!)) j++;
    const name = html.slice(i + (closing ? 2 : 1), j).toLowerCase();
    step(j);
    let style = "";
    while (i < n && html[i] !== ">") {
      const c = html[i]!;
      const t = templateEnd(i);
      if (t !== undefined) step(t);
      else if (SPACE.test(c)) {
        if (c !== "\n") mark(true);
        step(i + 1);
      } else if (c === "/") step(i + 1);
      else {
        let k = i;
        while (k < n && !/[\s=>]/.test(html[k]!)) k++;
        const attr = html.slice(i, k).toLowerCase();
        step(k);
        if (html[i] !== "=") continue;
        step(i + 1);
        while (i < n && SPACE.test(html[i]!)) step(i + 1);
        const q = html[i];
        if (q === '"' || q === "'") {
          step(i + 1);
          const close = end(html.indexOf(q, i), 0);
          if (attr === "style") {
            style = html.slice(i, close);
            css(close, false);
          } else step(close);
          step(close + 1);
        } else {
          while (i < n && !/[\s>]/.test(html[i]!)) step(i + 1);
        }
      }
    }
    const selfClosing = html[i - 1] === "/";
    step(i + 1);
    if (closing) {
      const at = open.findLastIndex((e) => e.name === name);
      if (at >= 0) keeps -= open.splice(at).filter((e) => e.keeps).length;
      return;
    }
    if (name === "style") {
      css(end(html.indexOf("</style", i), 0), true);
      return;
    }
    if (name === "script") step(end(html.indexOf("</script", i), 0));
    if (VOID.has(name) || selfClosing) return;
    const keep = name === "pre" || name === "textarea" || KEEPS_SPACE.test(style);
    open.push({ name, keeps: keep });
    if (keep) keeps++;
  };

  while (i < n) {
    if (html.startsWith("<!--", i)) {
      CONDITION.lastIndex = i;
      const cond = CONDITION.exec(html);
      if (cond) {
        if (!cond[1]) hidden++;
        step(i + cond[0].length);
      } else step(end(html.indexOf("-->", i + 4), 3)); // a comment, or <!--<![endif]-->
    } else if (html.startsWith("<![endif]-->", i)) {
      hidden = Math.max(0, hidden - 1);
      step(i + 12);
    } else if (html.startsWith("<!", i) || html.startsWith("<?", i)) step(end(html.indexOf(">", i), 1));
    else if (html[i] === "<" && /[a-zA-Z/]/.test(html[i + 1] ?? "")) tag();
    else {
      const t = templateEnd(i);
      if (t !== undefined) step(t);
      else {
        if ((html[i] === " " || html[i] === "\t") && !keeps && !hidden) mark(true);
        step(i + 1);
      }
    }
  }
  endLine(bytes);

  if (over.length > 0) {
    const longest = Math.max(...over.map((o) => o.bytes));
    const lines = over.length === 1 ? `Output line ${over[0]!.row} is` : `${over.length} output lines, from line ${over[0]!.row}, are up to`;
    ctx.diagnostics.report("W019", { message: `${lines} ${formatBytes(longest)} with nowhere safe to break; mail servers break lines over ${formatBytes(SMTP_LINE_BYTES)} anywhere` });
  }
  let out = "";
  let from = 0;
  for (const b of breaks) {
    out += `${html.slice(from, b.at)}\n`;
    from = b.replace ? b.at + 1 : b.at;
  }
  return out + html.slice(from);
};
