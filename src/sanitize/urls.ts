// Which URLs survive into the email (docs/support.md#sanitizing): an allow-list of schemes, so
// javascript:, vbscript:, data:text/html and whatever a client invents next all go.

// Browsers drop tabs and newlines anywhere in a URL and trim control chars around it; some mail
// clients also eat format and space chars. Removing them all before reading the scheme catches
// `java\tscript:`, `javascript :` and zero-width-space spellings.
const INVISIBLE = /[\x00-\x20\x7f-\x9f\p{Cf}\p{Zs}\p{Zl}\p{Zp}]/gu;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const ALLOWED: ReadonlySet<string> = new Set(["http", "https", "mailto", "tel", "sms", "cid"]);

// image: <img src>, srcset, background attributes, CSS url(); font: @font-face src; link: the rest
export type UrlUse = "link" | "image" | "font";

const DATA_TYPE: Record<UrlUse, RegExp | undefined> = {
  link: undefined,
  image: /^image\//,
  font: /^(font\/|application\/(x-)?font-|application\/vnd\.ms-fontobject|application\/octet-stream)/,
};

// The scheme to remove, or undefined when the URL may stay. Relative URLs, fragments and
// placeholders (td;dr fields, ESP syntax) have no scheme.
export const badScheme = (url: string, use: UrlUse): string | undefined => {
  const bare = url.replace(INVISIBLE, "");
  const m = SCHEME.exec(bare);
  if (!m) return undefined;
  const scheme = m[1]!.toLowerCase();
  if (ALLOWED.has(scheme)) return undefined;
  if (scheme === "data" && DATA_TYPE[use]?.test(bare.slice(5).toLowerCase())) return undefined;
  return scheme;
};

// The URLs in a srcset. A data: URL holds commas, so this follows the spec's candidate split:
// a URL runs to whitespace, and a descriptor to a comma outside parentheses.
export const srcsetUrls = (v: string): string[] => {
  const out: string[] = [];
  let i = 0;
  while (i < v.length) {
    while (i < v.length && /[\s,]/.test(v[i]!)) i++;
    let j = i;
    while (j < v.length && !/\s/.test(v[j]!)) j++;
    const raw = v.slice(i, j);
    const url = raw.replace(/,+$/, "");
    i = j;
    if (url === raw) {
      for (let depth = 0; i < v.length && (v[i] !== "," || depth > 0); i++) depth += v[i] === "(" ? 1 : v[i] === ")" ? -1 : 0;
    }
    if (url) out.push(url);
  }
  return out;
};
