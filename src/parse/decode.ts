// Bytes to text as a browser reads a file: a byte order mark wins, then the encoding the file
// declares, else UTF-8 (https://html.spec.whatwg.org/multipage/parsing.html#determining-the-character-encoding).
// compile() takes text; the CLI reads files through here.

export const BOM = "﻿";

// a leading U+FEFF is the encoding's mark, not text (https://encoding.spec.whatwg.org/#decode)
export const stripBom = (s: string): string => (s.startsWith(BOM) ? s.slice(1) : s);

const bomEncoding = (b: Uint8Array): string | undefined => {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return "utf-8";
  if (b[0] === 0xff && b[1] === 0xfe) return "utf-16le";
  if (b[0] === 0xfe && b[1] === 0xff) return "utf-16be";
  return undefined;
};

// the prescan (https://html.spec.whatwg.org/multipage/parsing.html#prescan-a-byte-stream-to-determine-its-encoding),
// over the first 1024 bytes read as ASCII: comments and other tags are skipped, and a <meta> declares
// with a charset attribute, or with content="…; charset=…" beside http-equiv="Content-Type"
const SPACE = /[\t\n\f\r /]/;
const prescan = (head: string): string | undefined => {
  let i = 0;
  // https://html.spec.whatwg.org/multipage/parsing.html#concept-get-attributes-when-sniffing
  const attribute = (): [string, string] | undefined => {
    while (i < head.length && SPACE.test(head[i]!)) i++;
    if (i >= head.length || head[i] === ">") return undefined;
    let name = head[i++]!;
    while (i < head.length && !/[\t\n\f\r />=]/.test(head[i]!)) name += head[i++];
    while (i < head.length && /[\t\n\f\r ]/.test(head[i]!)) i++;
    if (head[i] !== "=") return [name.toLowerCase(), ""];
    i++;
    while (i < head.length && /[\t\n\f\r ]/.test(head[i]!)) i++;
    const q = head[i];
    if (q === '"' || q === "'") {
      const close = head.indexOf(q, i + 1);
      const start = i + 1;
      i = close < 0 ? head.length : close + 1;
      return close < 0 ? undefined : [name.toLowerCase(), head.slice(start, close).toLowerCase()];
    }
    const start = i;
    while (i < head.length && !/[\t\n\f\r >]/.test(head[i]!)) i++;
    return [name.toLowerCase(), head.slice(start, i).toLowerCase()];
  };
  while (i < head.length) {
    if (head.startsWith("<!--", i)) {
      const close = head.indexOf("-->", i + 2);
      i = close < 0 ? head.length : close + 3;
    } else if (/^<meta[\t\n\f\r /]/i.test(head.slice(i, i + 6))) {
      i += 5;
      const seen = new Set<string>();
      let pragma = false;
      let fromContent: boolean | undefined; // the spec's need pragma
      let charset: string | undefined;
      for (let a = attribute(); a; a = attribute()) {
        const [name, value] = a;
        if (seen.has(name)) continue;
        seen.add(name);
        if (name === "http-equiv") pragma ||= value === "content-type";
        else if (name === "content" && charset === undefined) {
          const c = contentCharset(value);
          if (c !== undefined) [charset, fromContent] = [c, true];
        } else if (name === "charset") [charset, fromContent] = [value, false];
      }
      const encoding = charset === undefined || (fromContent && !pragma) ? undefined : declared(charset);
      if (encoding) return encoding;
    } else if (/^<\/?[a-z]/i.test(head.slice(i, i + 3))) {
      while (i < head.length && !/[\t\n\f\r >]/.test(head[i]!)) i++;
      while (attribute()) continue;
    } else if (/^<[!/?]/.test(head.slice(i, i + 2))) {
      const close = head.indexOf(">", i + 2);
      i = close < 0 ? head.length : close + 1;
    } else i++;
  }
  return undefined;
};

// https://html.spec.whatwg.org/multipage/urls-and-fetching.html#algorithm-for-extracting-a-character-encoding-from-a-meta-element
const contentCharset = (content: string): string | undefined => {
  const m = /charset[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r ;"']+))/.exec(content);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
};

// @charset is only a declaration as the file's first bytes (https://drafts.csswg.org/css-syntax/#determine-the-fallback-encoding)
const AT_CHARSET = /^@charset "([^"]+)";/;

const declared = (label: string): string | undefined => {
  try {
    const encoding = new TextDecoder(label).encoding;
    // a declared UTF-16 means UTF-8: the declaration itself was readable as ASCII
    return encoding.startsWith("utf-16") ? "utf-8" : encoding;
  } catch {
    // x-user-defined is windows-1252 to the prescan; a label TextDecoder doesn't know is UTF-8
    return /^\s*x-user-defined\s*$/i.test(label) ? "windows-1252" : undefined;
  }
};

// windows-1252's 0x80–0x9F (https://encoding.spec.whatwg.org/index-windows-1252.txt); Node 22's
// TextDecoder reads them as latin1's C1 controls, so the ones it gets wrong are mapped after
const C1 = "\u20AC\x81\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\x8D\u017D\x8F\x90\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\x9D\u017E\u0178";
const windows1252 = (s: string): string => s.replace(/[\x80-\x9f]/g, (c) => C1[c.charCodeAt(0) - 0x80]!);

const decode = (bytes: Uint8Array, sniff: (head: string) => string | undefined): string => {
  const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 1024));
  const encoding = bomEncoding(bytes) ?? sniff(head) ?? "utf-8";
  // TextDecoder drops the mark of the encoding it decodes
  const text = new TextDecoder(encoding).decode(bytes);
  return encoding === "windows-1252" ? windows1252(text) : text;
};

export const decodeHtml = (bytes: Uint8Array): string => decode(bytes, prescan);

export const decodeCss = (bytes: Uint8Array): string =>
  decode(bytes, (head) => {
    const label = AT_CHARSET.exec(head)?.[1];
    return label ? declared(label) : undefined;
  });
