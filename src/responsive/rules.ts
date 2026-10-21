// Overrides become classes on the base html and flat rules for one head <style> (docs/support.md#screens).
import type { Decls, Override, Tag } from "./diff.ts";
import type { Variant } from "./variants.ts";

// `page`: a width or dark screen's page colour where it differs from the desktop one ("transparent" for none)
export type Found = { variant: Variant; overrides: Override[]; page?: string };
// `page`: the class for the shell's page table, which repaints with the body
export type Head = { html: string; css: string; dark: boolean; page?: string };

export const className = (n: number): string => `t-${n.toString(36)}`;

// the values come decoded from attributes; a "<" could end the <style> element, and \3c is the same in CSS
const decl = ([p, v]: readonly [string, string]): string => `${p}:${v.replaceAll("<", "\\3c ")} !important;`;
const rule = (selector: string, decls: Decls): string => `${selector} { ${decls.map(decl).join(" ")} }`;

// Outlook.com marks the elements it recolours with these (docs/support.md#dark-mode)
const MIRRORS: ReadonlyArray<readonly [string, string]> = [["[data-ogsc]", "color"], ["[data-ogsb]", "background-color"]];

type Made = { name: string; decls: Decls };

// One class per distinct (variant, declarations), numbered as the elements first need them.
// An element's classes follow the variants' order.
const assign = (found: readonly Found[]): { classes: Map<number, string[]>; made: Made[][] } => {
  const classes = new Map<number, string[]>();
  const made: Made[][] = found.map(() => []);
  const byKey = new Map<string, string>();
  const indexes = [...new Set(found.flatMap((f) => f.overrides.map((o) => o.index)))].sort((a, b) => a - b);
  let next = 0;
  for (const index of indexes) {
    found.forEach((f, v) => {
      const o = f.overrides.find((x) => x.index === index);
      if (!o) return;
      const key = `${v}|${o.decls.map(([p, val]) => `${p}:${val}`).join(";")}`;
      let name = byKey.get(key);
      if (name === undefined) {
        name = className(next++);
        byKey.set(key, name);
        made[v]!.push({ name, decls: o.decls });
      }
      classes.set(index, [...(classes.get(index) ?? []), name]);
    });
  }
  return { classes, made };
};

const CLASS_ATTR = /(\sclass\s*=\s*)(?:"([^"]*)"|'([^']*)')/i;

// Merged into an existing class attribute, never replacing it.
export const addClasses = (html: string, tags: readonly Tag[], classes: ReadonlyMap<number, readonly string[]>): string => {
  let out = "";
  let at = 0;
  for (const [index, names] of [...classes].sort((a, b) => a[0] - b[0])) {
    const tag = tags[index]!;
    out += html.slice(at, tag.start);
    const add = names.join(" ");
    const has = CLASS_ATTR.exec(tag.text);
    out += has
      ? tag.text.replace(CLASS_ATTR, (_m, eq: string, dq?: string, sq?: string) => `${eq}"${[(dq ?? sq ?? "").trim(), add].filter(Boolean).join(" ")}"`)
      : `<${tag.name} class="${add}"${tag.text.slice(1 + tag.name.length)}`;
    at = tag.end;
  }
  return out + html.slice(at);
};

export const buildHead = (html: string, tags: readonly Tag[], found: readonly Found[]): Head | undefined => {
  const { classes, made } = assign(found);
  // the body and page table are the shell's (docs/support.md#the-email-shell): the body takes no class, the table one past the elements'
  const page = found.some((f) => f.page !== undefined) ? className(made.reduce((n, m) => n + m.length, 0)) : undefined;
  if (classes.size === 0 && !page) return undefined;
  const surface = (f: Found): Made[] => (page && f.page !== undefined ? [{ name: page, decls: [["background-color", f.page]] }] : []);
  const dark = found.some((f, v) => f.variant.kind === "dark" && made[v]!.length + surface(f).length > 0);
  const blocks: string[] = dark ? [":root { color-scheme: light dark; supported-color-schemes: light dark; }"] : [];
  const mirrors: string[] = [];
  const hover: string[] = [];
  found.forEach((f, v) => {
    const rules = made[v]!;
    if (f.variant.kind === "hover") return void hover.push(...rules.map((m) => rule(`.${m.name}:hover`, m.decls)));
    const own = surface(f);
    const all = [...own, ...rules];
    if (all.length === 0) return;
    const lines = [...own.map((m) => rule("body", m.decls)), ...all.map((m) => rule(`.${m.name}`, m.decls))];
    blocks.push(`${f.variant.media} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}`);
    if (f.variant.kind !== "dark") return;
    for (const m of all) {
      for (const [attr, prop] of MIRRORS) {
        const d = m.decls.filter(([p]) => p === prop);
        if (d.length > 0) mirrors.push(rule(`${attr} .${m.name}`, d));
      }
    }
  });
  return { html: addClasses(html, tags, classes), css: [...blocks, ...mirrors, ...hover].join("\n"), dark, ...(page ? { page } : {}) };
};
