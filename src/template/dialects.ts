import type { Cond, Operand } from "../ir/types.ts";
import { both, condText, normalize, type Leaf } from "./cond.ts";

// One branch of an if chain, its body already written in the dialect.
export type Written = { when: Cond; body: string };

// A dialect is a table of writers. `path` runs first on every path; inside an each block
// `scoped` says the path doesn't start at the loop variable. `text` writes the author's text
// between our tokens so the ESP leaves it alone (`beforeToken`: one of ours comes right after).
// `brace` is a `{` just before or a `}` just after one of our tokens, which would merge with it;
// undefined when the dialect has no way to write it in plain text. `choose` writes an if chain;
// `fresh` names a variable no other chain uses. `needs` is what the data must be for `choose`'s
// test of a condition to mean what it means in JS; with it met the test is exact.
export type Dialect = {
  path: (p: string, scoped: boolean) => string;
  field: (p: string) => string;
  each: (p: string, as: string) => [open: string, close: string];
  choose: (branches: readonly Written[], otherwise: string | undefined, fresh: () => string) => string;
  text: (s: string, beforeToken: boolean) => string;
  brace: (c: "{" | "}", html: boolean) => string | undefined;
  needs: (c: Leaf) => Need[];
  pathNeeds: (p: string) => Need[];
};

// a path is already written by the dialect; a string gets quotes, a number or boolean stays bare
const operand = (o: Operand): string => ("path" in o ? o.path : "num" in o ? String(o.num) : "bool" in o ? String(o.bool) : `"${o.literal}"`);

// ---- what the data must be for a dialect's test to read like JS

// What a dialect's output needs of the data for one condition to mean what it means in JS.
// `ok` gets the values of `paths` (undefined when missing). preview() checks it on sample data.
export type Need = { paths: readonly string[]; ok: (...v: unknown[]) => boolean; want: string; why: string; hint: string };

const isList = (v: unknown): boolean => Array.isArray(v);
const emptyList = (v: unknown): boolean => Array.isArray(v) && v.length === 0;
const str = (v: unknown): boolean => typeof v === "string";
const num = (v: unknown): boolean => typeof v === "number";
const unset = (v: unknown): boolean => v === null || v === undefined;

// Every dialect: `.length` counts the items of a list or the characters of a string, in JS and
// in both engines; anything else has no length (and JS would fail on null).
export const listNeed = (path: string): Need => ({
  paths: [path],
  ok: (v) => isList(v) || str(v),
  want: "a list or a string",
  why: "the test reads its length",
  hint: "send a list ([] for none)",
});

// Every dialect: a loop repeats a list's items. On anything else the engines disagree (Handlebars
// repeats an object once per value, Liquid a string once) and JS's .map fails.
export const eachNeed = (path: string): Need => ({
  paths: [path],
  ok: (v) => isList(v) || unset(v),
  want: "a list, null or missing",
  why: "only a list repeats the same way everywhere",
  hint: "send a list ([] for none)",
});

// What the template relies on from the ESP's `equals` / `notEquals` block helpers (built into
// some ESPs; with plain Handlebars the sender registers them): for two strings, or two numbers,
// equality as JS ===; and a null or missing value equals no non-empty string and no number.
// Nothing else: helpers that coerce ("1" equals 1) and strict ones both qualify. undefined: a
// pair the template never asks about, given the data needs below.
export const equalsHelper = (a: unknown, b: unknown): boolean | undefined => {
  if ((str(a) && str(b)) || (num(a) && num(b))) return a === b;
  const known = (x: unknown) => (str(x) && x !== "") || num(x);
  if ((unset(a) && known(b)) || (unset(b) && known(a))) return false;
  return undefined;
};

const HB_EMPTY = "Handlebars counts an empty list as false, JS as true";
const handlebarsNeeds = (c: Leaf): Need[] => {
  switch (c.op) {
    case "truthy":
      return [{ paths: [c.path], ok: (v) => !emptyList(v), want: "anything but an empty list", why: HB_EMPTY, hint: `test a list with ${c.path}.length != 0 (items.length > 0 in a component)` }];
    case "nullish":
      return [
        {
          paths: [c.path],
          ok: (v) => unset(v) || (!!v && !emptyList(v)),
          want: 'null, missing, or a value other than false, 0, "" and []',
          why: "Handlebars can't tell null from those: the template tests that the value is false-like",
          hint: `leave ${c.path} out (or send null) when it has no value, or fall back with || if "", 0 and false should fall back too`,
        },
      ];
    case "nonEmpty":
      return [];
    case "==":
    case "!=": {
      const r = c.right;
      const p = c.left.path;
      const helper = "the comparison helper is only relied on for two strings or two numbers";
      if ("path" in r)
        return [{ paths: [p, r.path], ok: (a, b) => (str(a) && str(b)) || (num(a) && num(b)), want: "two strings or two numbers", why: helper, hint: "send both sides as text (or both as numbers), never missing" }];
      if ("bool" in r)
        return r.bool
          ? [{ paths: [p], ok: (v) => typeof v === "boolean" || unset(v), want: "a boolean, null or missing", why: "Handlebars tests it as a flag, so any other true-like value would count as true", hint: `send true / false, or test ${p} itself if any set value counts` }]
          : [{ paths: [p], ok: (v) => typeof v === "boolean", want: "a boolean", why: 'Handlebars tests it as a flag, so null, missing, 0 and "" would count as false', hint: `send false rather than leaving ${p} out, or test !${p} if any unset value counts` }];
      if ("num" in r) return [{ paths: [p], ok: (v) => num(v) || unset(v), want: "a number, null or missing", why: helper, hint: `send ${p} as a number, or compare with a quoted string ('${r.num}') if the data holds text` }];
      return r.literal === ""
        ? [{ paths: [p], ok: str, want: "a string", why: "a helper may count a missing value as \"\"", hint: `send "" rather than leaving ${p} out` }]
        : [{ paths: [p], ok: (v) => str(v) || unset(v), want: "a string, null or missing", why: helper, hint: `send ${p} as text` }];
    }
  }
};

// Liquid answers `.size` of a list, string or hash, and `.first` / `.last` of a list, itself,
// unless the object has a field of that name: then it reads the field, as JS does.
const BUILT_IN: Record<string, (parent: unknown) => boolean> = {
  size: (v) => v === null || typeof v !== "object" ? typeof v !== "string" : !isList(v) && Object.hasOwn(v, "size"),
  first: (v) => !isList(v),
  last: (v) => !isList(v),
};
const liquidPathNeeds = (path: string): Need[] => {
  const names = path.split(".");
  return names.slice(1).flatMap((n, i) => {
    const ok = BUILT_IN[n];
    const parent = names.slice(0, i + 1).join(".");
    return ok
      ? [{ paths: [parent], ok, want: n === "size" ? "null, a number, a boolean or an object with its own size field" : "anything but a list", why: `Liquid reads .${n} of ${n === "size" ? "a list, string or object" : "a list"} as its own built-in`, hint: `rename the ${n} field in the data, or don't read ${path} off a list` }]
      : [];
  });
};

const liquidNeeds = (c: Leaf): Need[] =>
  (c.op === "==" || c.op === "!=") && "path" in c.right
    ? [{ paths: [c.left.path, c.right.path], ok: (a, b) => !(isList(a) && isList(b)), want: "not two lists", why: "Liquid compares lists by their items, JS by identity", hint: "compare a field of each instead" }]
    : [];

// ---- Handlebars

// What Handlebars can test: its own truthiness (JS's, except that [] is false) and the helpers.
type H = { h: "if" | "unless"; path: string } | { h: "equals" | "notEquals"; a: string; b: string } | { h: "and" | "or"; xs: H[] };

const FLIP = { if: "unless", unless: "if", equals: "notEquals", notEquals: "equals" } as const;

// A normalized condition (a not sits on a leaf) as Handlebars tests, each exact under its needs.
const hb = (c: Cond): H => {
  switch (c.op) {
    case "truthy":
    case "nonEmpty": // a list: false exactly when empty
      return { h: "if", path: c.path };
    case "nullish":
      return { h: "unless", path: c.path };
    case "==":
    case "!=":
      if ("bool" in c.right) return { h: c.right.bool === (c.op === "==") ? "if" : "unless", path: c.left.path };
      return { h: c.op === "==" ? "equals" : "notEquals", a: c.left.path, b: operand(c.right) };
    case "not": {
      const x = hb(c.cond);
      if ("path" in x) return { h: FLIP[x.h], path: x.path };
      if ("a" in x) return { h: FLIP[x.h], a: x.a, b: x.b };
      return hb(normalize(c));
    }
    case "and":
    case "or":
      return { h: c.op, xs: c.conds.map(hb) };
  }
};

const hbIf = (c: H, then: string, otherwise: string): string => {
  const rest = otherwise ? `{{else}}${otherwise}` : "";
  switch (c.h) {
    case "if":
    case "unless":
      return `{{#${c.h} ${c.path}}}${then}${rest}{{/${c.h}}}`;
    case "equals":
    case "notEquals":
      return `{{#${c.h} ${c.a} ${c.b}}}${then}${rest}{{/${c.h}}}`;
    // no boolean operators: and / or nest, which repeats a body (the else body for and, the then body for or)
    case "and": {
      const [first, ...more] = c.xs;
      return hbIf(first!, more.length ? hbIf({ h: "and", xs: more }, then, otherwise) : then, otherwise);
    }
    case "or": {
      const [first, ...more] = c.xs;
      return hbIf(first!, then, more.length ? hbIf({ h: "or", xs: more }, then, otherwise) : otherwise);
    }
  }
};

// `{{else if}}` only for plain paths, the form ESPs document; anything else nests in the else.
const plainIf = (h: H): string | undefined => (h.h === "if" ? h.path : undefined);
const hbChain = (bs: readonly { when: H; body: string }[], otherwise: string | undefined): string => {
  const [first, ...rest] = bs;
  if (!first) return otherwise ?? "";
  const head = plainIf(first.when);
  if (head === undefined) return hbIf(first.when, first.body, rest.length || otherwise ? hbChain(rest, otherwise) : "");
  let out = `{{#if ${head}}}${first.body}`;
  let i = 0;
  for (let p: string | undefined; i < rest.length && (p = plainIf(rest[i]!.when)) !== undefined; i++) out += `{{else if ${p}}}${rest[i]!.body}`;
  const tail = i < rest.length || otherwise !== undefined ? hbChain(rest.slice(i), otherwise) : "";
  return `${out}${tail ? `{{else}}${tail}` : ""}{{/if}}`;
};

export const handlebars: Dialect = {
  // each switches the context, so anything not read off the loop variable goes through @root
  path: (p, scoped) => (scoped ? `@root.${p}` : p),
  field: (p) => `{{${p}}}`,
  // \{{ is a literal {{. Backslashes the author typed before one, or before a token of ours,
  // would turn into an escape: the empty comment {{!}} keeps them as text.
  text: (s, beforeToken) => {
    const out = s.replace(/(\\*)\{\{/g, (_m, bs: string) => (bs ? `${bs}\\{{!}}\\{{` : "\\{{"));
    return beforeToken ? out.replace(/\\+$/, (bs) => `${bs}\\{{!}}`) : out;
  },
  // Handlebars can't write a lone brace next to a mustache; in HTML an entity reads the same
  brace: (c, html) => (html ? (c === "{" ? "&#123;" : "&#125;") : undefined),
  each: (p, as) => [`{{#each ${p} as |${as}|}}`, "{{/each}}"],
  choose: (bs, otherwise) => hbChain(bs.map((b) => ({ when: hb(b.when), body: b.body })), otherwise),
  needs: handlebarsNeeds,
  pathNeeds: () => [],
};

// Liquid counts only nil and false as false; `!= 0` and `!= ""` make a path test JS truthiness
// exactly ([] and {} stay true, as in JS). Inside an or, that triple is a chain of its own.
// Its == compares like JS === for everything but two lists (see liquidNeeds).
const truthy = (p: string): string => `${p} and ${p} != 0 and ${p} != ""`;
const isChain = (c: Cond): boolean => c.op === "and" || c.op === "or" || c.op === "truthy";

// Liquid reads `a and b or c` right to left, as a and (b or c), and has no parentheses and no
// not. So a chain of and / or is written inline when at most one operand is itself a chain (it
// goes last, where right-to-left grouping puts it); a negated path never is.
const inline = (c: Cond): string | undefined => {
  switch (c.op) {
    case "truthy":
      return truthy(c.path);
    case "nullish":
      return `${c.path} == nil`;
    case "nonEmpty":
      return `${c.path}.size > 0`;
    case "==":
    case "!=":
      return `${c.left.path} ${c.op} ${operand(c.right)}`;
    case "not":
      if (c.cond.op === "nullish") return `${c.cond.path} != nil`;
      if (c.cond.op === "nonEmpty") return `${c.cond.path}.size == 0`;
      return undefined;
    case "and":
    case "or": {
      // a path's triple is more of the same and-chain, so only an or has to place it
      const chain = (x: Cond) => (c.op === "and" ? x.op === "or" : isChain(x));
      const simple = c.conds.filter((x) => !chain(x));
      const nested = c.conds.filter(chain);
      if (nested.length > 1) return undefined;
      const parts = [...simple, ...nested].map(inline);
      return parts.every((p) => p !== undefined) ? parts.join(` ${c.op} `) : undefined;
    }
  }
};

// Tags that run `body` when `c` holds, for a condition `inline` can't write (normalized).
const when = (c: Cond, body: string): string => {
  const s = inline(c);
  if (s !== undefined) return `{% if ${s} %}${body}{% endif %}`;
  switch (c.op) {
    case "not": {
      // normalized: a not sits on a leaf, and every leaf is inline
      const inner = inline(c.cond);
      if (inner === undefined) throw new Error(`template: liquid can't test ${condText(c)}`);
      return `{% unless ${inner} %}${body}{% endunless %}`;
    }
    case "and": {
      // what can be tested at once is, the rest nests inside it
      const ready = c.conds.filter((x) => inline(x) !== undefined);
      const later = c.conds.filter((x) => inline(x) === undefined);
      const outer = ready.length ? inline(both("and", ready)) : undefined;
      if (outer !== undefined) return `{% if ${outer} %}${when(both("and", later), body)}{% endif %}`;
      const [first, ...more] = c.conds;
      return when(first!, when(both("and", more), body));
    }
    case "or":
      // running body twice is harmless: it only sets a flag
      return c.conds.map((x) => when(x, body)).join("");
    default:
      // a leaf is always inline
      throw new Error(`template: liquid can't test ${condText(c)}`);
  }
};

export const liquid: Dialect = {
  path: (p) => p,
  // Liquid doesn't escape output unless asked; Handlebars always does
  field: (p) => `{{ ${p} | escape }}`,
  text: (s, beforeToken) => s.replace(beforeToken ? /\{(?=[{%]|$)/g : /\{(?=[{%])/g, '{{ "{" }}'),
  brace: (c) => (c === "{" ? '{{ "{" }}' : "}"),
  each: (p, as) => [`{% for ${as} in ${p} %}`, "{% endfor %}"],
  choose: (bs, otherwise, fresh) => {
    const rest = otherwise !== undefined ? `{% else %}${otherwise}` : "";
    const only = bs.length === 1 ? bs[0]! : undefined;
    // unless reads better than a flipped comparison, and needs no flag for a negated path
    if (only?.when.op === "not" && only.when.cond.op !== "nullish" && only.when.cond.op !== "nonEmpty") {
      const s = inline(normalize(only.when.cond));
      if (s !== undefined) return `{% unless ${s} %}${only.body}${rest}{% endunless %}`;
    }
    // a condition Liquid can't write inline is computed into a flag first
    let flags = "";
    const tests = bs.map((b) => {
      const c = normalize(b.when);
      const s = inline(c);
      if (s !== undefined) return s;
      const name = fresh();
      flags += `{% assign ${name} = false %}${when(c, `{% assign ${name} = true %}`)}`;
      return name;
    });
    const branches = bs.map((b, i) => `{% ${i ? "elsif" : "if"} ${tests[i]} %}${b.body}`).join("");
    return `${flags}${branches}${rest}{% endif %}`;
  },
  needs: liquidNeeds,
  pathNeeds: liquidPathNeeds,
};

export const dialects = { handlebars, liquid } as const;
export type DialectName = keyof typeof dialects;
