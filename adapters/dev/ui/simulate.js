// Client simulation: the compiled email rewritten the way a stricter client would treat it, for the
// Compiled frame only. The code, size and Copy always show the real output. No element is added
// or dropped (a <style> is emptied, an <img> loses only its src), so the frame still lines up
// with the code start tag by start tag; forced dark adds one <style> at the end of the head.

/** @typedef {"nostyle" | "nomedia" | "noimages" | "dark"} Sim */
/** @typedef {{ id: Sim, label: string, does: string, like?: string, seen?: [family: string, platform: string][], feature?: string }} SimInfo */

// `like` names only clients caniemail.json tests as unsupported for `feature` (see dev-simulate.test)
/** @type {SimInfo[]} */
export const SIMS = [
  {
    id: "nostyle",
    label: "No <style>",
    does: "Empties every <style> element, so only inline styles apply.",
    like: "Gmail mobile webmail, GMX and WEB.DE webmail",
    seen: [
      ["gmail", "mobile-webmail"],
      ["gmx", "desktop-webmail"],
      ["web-de", "desktop-webmail"],
    ],
    feature: "html-style",
  },
  {
    id: "nomedia",
    label: "No @media",
    does: "Keeps <style> but drops its @media rules, so nothing responds to the screen size.",
    like: "Outlook 2007–2019 and Windows Mail on Windows, Mozilla Thunderbird on macOS",
    seen: [
      ["outlook", "windows"],
      ["outlook", "windows-mail"],
      ["thunderbird", "macos"],
    ],
    feature: "css-at-media",
  },
  {
    id: "noimages",
    label: "Images off",
    does: "Blocks images, as when a reader hasn't loaded them: each shows its alt text in a dashed box, and CSS background images are dropped.",
  },
  {
    id: "dark",
    label: "Forced dark",
    does: "An approximation of the colour inversion some clients apply: light backgrounds turn dark and dark text turns light. Images and borders are left alone.",
  },
];

const IDS = SIMS.map((s) => s.id);

// the hash's `sim=` value, a comma list: the known ids in it, in SIMS order, each once
/** @param {string | undefined} v @returns {Sim[]} */
export const parseSims = (v) => {
  const on = new Set((v ?? "").split(","));
  return IDS.filter((id) => on.has(id));
};

/** @param {string} html @param {Iterable<Sim>} sims */
export const simulate = (html, sims) => {
  const on = new Set(sims);
  let out = html;
  if (on.has("nostyle")) out = noStyle(out);
  else if (on.has("nomedia")) out = noMedia(out);
  if (on.has("noimages")) out = noImages(out);
  if (on.has("dark")) out = forcedDark(out);
  return out;
};

// ---- walking the markup

const RAW = new Set(["script", "style", "textarea", "title"]);
// the Fields view's own chip style is the preview's, not the email's
const ours = (/** @type {string} */ css) => css.includes(".tddr-chip");

// Rewrites each start tag's attributes and each <style>'s text; comments (Outlook's conditionals
// included) and the insides of the other raw-text elements are copied as they are.
/** @param {string} html @param {{ attrs?: (tag: string, attrs: string) => string, css?: (css: string) => string }} fn */
const rewrite = (html, fn) => {
  const re = /<!--(?:>|->)|<!--[\s\S]*?-->|<[!?][^>]*>|<\/[a-zA-Z][^>]*>|<([a-zA-Z][^\s/>]*)/g;
  const lower = html.toLowerCase();
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!m[1]) continue;
    const tag = m[1].toLowerCase();
    const from = re.lastIndex;
    let j = from;
    let quote = "";
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const attrs = html.slice(from, j);
    out += html.slice(last, from) + (fn.attrs ? fn.attrs(tag, attrs) : attrs);
    last = j;
    re.lastIndex = j;
    if (!RAW.has(tag)) continue;
    const close = lower.indexOf(`</${tag}`, j);
    const end = close < 0 ? html.length : close;
    const text = html.slice(j + 1, end);
    out += html.slice(j, j + 1) + (tag === "style" && fn.css && !ours(text) ? fn.css(text) : text);
    last = end;
    re.lastIndex = end;
  }
  return out + html.slice(last);
};

const ATTR = /(\s*)([^\s"'>/=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
const unquote = (/** @type {string} */ v) => (/^["']/.test(v) ? v.slice(1, -1) : v);

// `fn` returns the attribute's new value, null to drop it, or undefined to leave it
/** @param {string} attrs @param {(name: string, value: string) => string | null | undefined} fn */
const mapAttrs = (attrs, fn) =>
  attrs.replace(ATTR, (all, sp, name, _eq, value) => {
    const was = value === undefined ? "" : unquote(value);
    const next = fn(name.toLowerCase(), was);
    if (next === undefined || (next === was && value?.startsWith('"'))) return all;
    return next === null ? "" : `${sp}${name}="${next.replace(/"/g, "&quot;")}"`;
  });

/** @param {string} attrs @param {string} decl */
const addStyle = (attrs, decl) => {
  let had = false;
  const out = mapAttrs(attrs, (name, v) => {
    if (name !== "style") return undefined;
    had = true;
    return `${v.trim().replace(/;?$/, ";")}${decl}`.replace(/^;/, "");
  });
  return had ? out : attrs.replace(/\s*\/?\s*$/, (end) => ` style="${decl}"${end}`);
};

// ---- CSS text

// a declaration of one of `props`, its value running to the next ; or brace outside url() and quotes
/** @param {string} props */
const declRe = (props) => new RegExp(`(?<![\\w.#-])(${props})(\\s*:\\s*)((?:url\\([^)]*\\)|"[^"]*"|'[^']*'|[^;{}"'])*)`, "gi");
const BG = declRe("background|background-image|background-color");
const FG = declRe("color");
const URL = /url\(\s*(?:"[^"]*"|'[^']*'|[^)"']*)\s*\)/gi;

/** @param {string} css @param {RegExp} re @param {(value: string) => string} fn */
const mapDecls = (css, re, fn) => css.replace(re, (_m, prop, colon, value) => prop + colon + fn(value));

// @media blocks, braces matched past strings and comments
/** @param {string} css */
const dropMedia = (css) => {
  let out = "";
  let from = 0;
  /** @type {number | null} */
  let media = null; // where the @media being dropped starts
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
    } else if (c === '"' || c === "'") {
      const end = css.indexOf(c, i + 1);
      i = end < 0 ? css.length : end;
    } else if (media === null && c === "@" && /^@media\b/i.test(css.slice(i, i + 7))) {
      media = i;
      depth = 0;
    } else if (media !== null && c === "{") depth++;
    else if (media !== null && c === "}" && --depth === 0) {
      out += css.slice(from, media);
      from = i + 1;
      media = null;
    }
  }
  return out + css.slice(from, media ?? css.length);
};

// ---- the simulations

/** @param {string} html */
export const noStyle = (html) => rewrite(html, { css: () => "" });

/** @param {string} html */
export const noMedia = (html) => rewrite(html, { css: dropMedia });

// a box the size the image would have taken, the alt text inside it
export const BLOCKED = "outline:1px dashed #9a9aa6;outline-offset:-1px";

/** @param {string} css */
const noBackgroundImages = (css) => mapDecls(css, BG, (v) => v.replace(URL, "none"));

/** @param {string} html */
export const noImages = (html) =>
  rewrite(html, {
    css: noBackgroundImages,
    attrs: (tag, attrs) => {
      let out = mapAttrs(attrs, (name, v) => {
        if (name === "background") return null;
        if (name === "style") return noBackgroundImages(v);
        if ((tag === "img" || tag === "source") && (name === "src" || name === "srcset")) return null;
        return undefined;
      });
      if (tag === "img") out = addStyle(out, BLOCKED);
      return out;
    },
  });

// ---- forced dark

/** @typedef {[r: number, g: number, b: number, a: number]} Rgba */

const NAMED = /** @type {Record<string, Rgba>} */ ({ white: [255, 255, 255, 1], black: [0, 0, 0, 1] });
const COLOR = /(url\([^)]*\))|(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b)/gi;

/** @param {string} c @returns {Rgba | null} */
export const parseColor = (c) => {
  const s = c.toLowerCase();
  const named = NAMED[s];
  if (named) return named;
  const hex = /^#([0-9a-f]{3,8})$/.exec(s)?.[1];
  if (hex) {
    if (hex.length === 5 || hex.length === 7) return null;
    const d = hex.length <= 4 ? [...hex].map((x) => x + x) : (hex.match(/../g) ?? []);
    const [r = 0, g = 0, b = 0, a = 255] = d.map((x) => parseInt(x, 16));
    return [r, g, b, a / 255];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (!fn) return null;
  const alpha = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : Number(fn[4]);
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), Math.min(1, alpha)];
};

// relative luminance, 0 (black) to 1 (white)
/** @param {Rgba} c */
export const luminance = ([r, g, b]) => {
  const lin = (/** @type {number} */ v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** @param {Rgba} c @returns {[h: number, s: number, l: number]} */
const toHsl = ([r, g, b]) => {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
};

/** @param {number} h @param {number} s @param {number} l @param {number} a */
const fromHsl = (h, s, l, a) => {
  const k = (/** @type {number} */ n) => (n + h / 30) % 12;
  const t = s * Math.min(l, 1 - l);
  const ch = (/** @type {number} */ n) => Math.round(255 * (l - t * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  const [r, g, b] = [ch(0), ch(8), ch(4)];
  return a < 1 ? `rgba(${r},${g},${b},${+a.toFixed(3)})` : `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const LIGHT = 0.35;

// a light background goes dark, keeping its hue; a dark one stays
/** @param {string} c */
export const darkBackground = (c) => {
  const rgba = parseColor(c);
  if (!rgba || luminance(rgba) <= LIGHT) return c;
  const [h, s, l] = toHsl(rgba);
  return fromHsl(h, s, 0.08 + (1 - l) * 0.5, rgba[3]);
};

// dark text goes light, keeping its hue; light text stays
/** @param {string} c */
export const darkText = (c) => {
  const rgba = parseColor(c);
  if (!rgba || luminance(rgba) > LIGHT) return c;
  const [h, s, l] = toHsl(rgba);
  return fromHsl(h, s, 0.92 - l * 0.4, rgba[3]);
};

/** @param {string} value @param {(c: string) => string} fn */
const mapColors = (value, fn) => value.replace(COLOR, (all, url) => (url ? all : fn(all)));

/** @param {string} css */
const darkCss = (css) => mapDecls(mapDecls(css, BG, (v) => mapColors(v, darkBackground)), FG, (v) => mapColors(v, darkText));

// what the page is painted when the email sets nothing
const DARK_PAGE = "<style>:where(html){background:#141414;color:#ebebeb}</style>";
const TEXT_ATTRS = new Set(["text", "link", "vlink", "alink"]);

/** @param {string} html */
export const forcedDark = (html) => {
  const out = rewrite(html, {
    css: darkCss,
    attrs: (tag, attrs) =>
      mapAttrs(attrs, (name, v) => {
        if (name === "style") return darkCss(v);
        if (name === "bgcolor") return darkBackground(v.trim());
        if ((name === "color" && tag === "font") || (tag === "body" && TEXT_ATTRS.has(name))) return darkText(v.trim());
        return undefined;
      }),
  });
  return /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${DARK_PAGE}</head>`) : DARK_PAGE + out;
};
