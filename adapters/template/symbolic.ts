import { field, isPath, pathProblem } from "../../src/template/tokens.ts";
import { templateError } from "./errors.ts";
// a cycle, used only at call time
import { cond } from "./ops.ts";

// Symbol.for, so values made by one copy of this module (the adapter's) are read by another
// (the one Vite's runner evaluates for the components).
export const SYMBOLIC = Symbol.for("tddr.symbolic");

// One template render. Loop variables stay clear of the root fields the render reads.
export type Render = { roots: Set<string>; aliases: Set<string>; reserved: ReadonlySet<string> };

export type Kind = "field" | "index" | "length" | "filtered";
export type Info = {
  path: string;
  kind: Kind;
  render: Render;
  scope: readonly string[]; // loop variables around this value
  keep?: (item: unknown) => unknown; // a filtered list's predicate
};

export type Symbolic = { readonly [SYMBOLIC]: Info };

export const infoOf = (v: unknown): Info | undefined =>
  typeof v === "function" || (typeof v === "object" && v !== null) ? (v as Partial<Symbolic>)[SYMBOLIC] : undefined;

export const isSymbolic = (v: unknown): v is Symbolic => infoOf(v) !== undefined;

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

// Keys frameworks and the language probe objects with. They read as missing, not as fields.
const PROBES = new Set(["then", "toJSON", "constructor", "prototype", "nodeType", "asymmetricMatch"]);
export const isProbe = (k: string): boolean => PROBES.has(k) || k.startsWith("__") || k.startsWith("$");
// and what React reads off an element's props
const ROOT_PROBES = new Set(["children", "key", "ref"]);

const NAME_HINT = "use dotted names of letters, digits and _ (order.total) that aren't template keywords, helpers or built-in object members (this, true, constructor, forloop, and, log ...); rename the field in the data";
const fieldHint = "send the value ready to print in the data (formatted money, dates, counts), or branch on it in markup with ?: / && / v-if";

export const textOf = (i: Info): string => {
  if (i.kind === "index") throw templateError(`the index of ${i.path}`, "a loop position isn't available in a template.", "send a flag in each item (e.g. first: true) and test that");
  if (i.kind === "length") throw templateError(`${i.path}.length`, "a list's length can't be printed portably.", "send the count in the data, or test the list itself (items.length > 0)");
  if (i.kind === "filtered") throw templateError(`${i.path}.filter(…)`, "a filtered list can only be looped over with .map.", "write items.filter(f).map(g), or send the filtered list in the data");
  try {
    return field(i.path);
  } catch {
    throw templateError(i.path, `is not a data path an ESP can read: ${pathProblem(i.path) ?? "not a dotted name"}.`, NAME_HINT);
  }
};

const named = (path: string): string => path.slice(path.lastIndexOf(".") + 1);

// A loop variable named like the callback's parameter when it has one, clear of the loops
// around it and the root fields.
const PARAM = /^(?:async\s*)?(?:function\b[^(]*)?\(?\s*([A-Za-z_]\w*)\s*[,)=]/;
const aliasFor = (fn: unknown, list: Info): string => {
  const m = typeof fn === "function" ? PARAM.exec(fn.toString()) : null;
  const base = m && isPath(m[1]!) ? m[1]! : "item";
  const taken = (n: string) => list.scope.includes(n) || list.render.reserved.has(n) || n === list.path.split(".")[0];
  let name = base;
  for (let n = 2; taken(name); n++) name = `${base}${n}`;
  list.render.aliases.add(name);
  return name;
};

export type Loop = { of: string; as: string; item: Symbolic; index: Symbolic; keep?: (item: unknown) => unknown };

export const loopOver = (list: Symbolic, fn: unknown): Loop => {
  const i = list[SYMBOLIC];
  if (i.kind !== "field" && i.kind !== "filtered") throw templateError(textSubject(i), "can't be looped over.", "loop over a list field");
  const as = aliasFor(fn, i);
  const scope = [...i.scope, as];
  const item = symbolic({ path: as, kind: "field", render: i.render, scope });
  const index = symbolic({ path: as, kind: "index", render: i.render, scope });
  return { of: i.path, as, item, index, ...(i.keep ? { keep: i.keep } : {}) };
};

const textSubject = (i: Info): string => (i.kind === "length" ? `${i.path}.length` : i.kind === "index" ? `the index of ${i.path}` : i.path);

// `.map` makes an each block; the engines are what repeat it
export const EACH = Symbol.for("tddr.each");
export type Each = { readonly [EACH]: true; of: string; as: string; body: unknown };

export const isEach = (v: unknown): v is Each => typeof v === "object" && v !== null && EACH in v;

const noString = {
  [Symbol.toPrimitive]() {
    throw templateError("a loop", "can't be turned into text.", "render the list as markup");
  },
};

const mapOver = (list: Symbolic, fn: (item: unknown, index: unknown, list: unknown) => unknown): Each => {
  if (typeof fn !== "function") throw new TypeError(`${list[SYMBOLIC].path}.map: the callback is not a function`);
  const loop = loopOver(list, fn);
  const run = () => fn(loop.item, loop.index, list);
  const body = loop.keep ? cond(loop.keep(loop.item), run, () => undefined) : run();
  return Object.assign(Object.create(noString), { [EACH]: true as const, of: loop.of, as: loop.as, body });
};

const methodError = (i: Info): Error => {
  const at = i.path.lastIndexOf(".");
  if (at < 0) return templateError(i.path, "is a template field, not a function.", fieldHint);
  const method = named(i.path);
  return templateError(`${i.path.slice(0, at)}.${method}()`, "calls a method on a template field; the ESP fills it at send time, so there is nothing to call it on.", fieldHint);
};

const readOnly = (info: Info, key: string | symbol): never => {
  throw templateError(`${info.path}.${String(key)}`, "is assigned to or deleted; template fields are read-only.", "keep your own values in local variables");
};

export const symbolic = (info: Info): Symbolic => {
  const self = new Proxy(() => {}, {
    get(_t, key) {
      if (key === SYMBOLIC) return info;
      if (key === Symbol.toPrimitive)
        return (hint: string) => {
          if (hint === "number") throw templateError(textSubject(info), "is used as a number; arithmetic and numeric formatting can't run on a template field.", fieldHint);
          return textOf(info);
        };
      if (key === INSPECT) return () => `[template field ${textSubject(info)}]`;
      if (key === "toString") return () => textOf(info);
      if (key === Symbol.iterator)
        return () => {
          throw templateError(textSubject(info), "is iterated (spread, for…of, Array.from); a template loop only comes from .map.", "write list.map(item => …)");
        };
      if (typeof key === "symbol" || isProbe(key)) return undefined;
      if (info.kind === "index" || info.kind === "length") throw templateError(textSubject(info), `has no .${key}.`, fieldHint);
      if (info.kind === "filtered" && key !== "map") throw templateError(`${info.path}.filter(…).${key}`, "is not available; a filtered list only maps.", "write items.filter(f).map(g)");
      if (key === "map") return (fn: (item: unknown, index: unknown, list: unknown) => unknown) => mapOver(self as unknown as Symbolic, fn);
      if (key === "filter")
        return (keep: (item: unknown) => unknown) => {
          if (info.keep) throw templateError(`${info.path}.filter(…).filter(…)`, "chains two filters.", "combine them with && in one filter");
          return symbolic({ ...info, kind: "filtered", keep });
        };
      if (key === "length") return symbolic({ ...info, kind: "length" });
      if (/^\d+$/.test(key)) throw templateError(`${info.path}[${key}]`, "picks a list item by position, which the dialects can't do portably.", "send that item as its own field");
      const path = `${info.path}.${key}`;
      if (!isPath(path)) throw templateError(path, `is not a data path an ESP can read: ${pathProblem(path)}.`, NAME_HINT);
      return symbolic({ ...info, path, kind: "field" });
    },
    apply() {
      throw methodError(info);
    },
    has: () => false,
    ownKeys() {
      throw templateError(textSubject(info), "is spread or its keys are listed; a template field's keys aren't known until the ESP fills it.", "pass the field itself and read the keys you need off it");
    },
    getOwnPropertyDescriptor: () => undefined,
    set: (_t, key) => readOnly(info, key),
    defineProperty: (_t, key) => readOnly(info, key),
    deleteProperty: (_t, key) => readOnly(info, key),
  });
  return self as unknown as Symbolic;
};

export const newRender = (reserved: ReadonlySet<string> = new Set()): Render => ({ roots: new Set(), aliases: new Set(), reserved });

export const fieldOf = (render: Render, name: string): Symbolic => {
  render.roots.add(name);
  return symbolic({ path: name, kind: "field", render, scope: [] });
};

// The props object a React component gets: every name it reads is a top-level field. It lists
// no keys, so React takes it as the element's props as is; once `arm`ed, spreading it throws
// instead of silently giving nothing.
export const rootProps = (render: Render): { props: Record<string, unknown>; arm: () => void } => {
  let armed = false;
  const props = new Proxy(
    {},
    {
      get: (_t, key) => (typeof key === "symbol" || isProbe(key) || ROOT_PROBES.has(key) ? undefined : fieldOf(render, key)),
      has: () => false,
      ownKeys: () => {
        if (armed) throw templateError("the email's props", "are spread or their keys listed; the fields are only known as the email reads them.", "read the props you need by name: ({ order, customer }) => …");
        return [];
      },
      getOwnPropertyDescriptor: () => undefined,
    },
  );
  return { props, arm: () => (armed = true) };
};

// A loop variable can't share a name with a root field the template reads, or the field would
// be hidden inside the loop: render again with those names taken.
export const renderSymbolic = async <T>(run: (r: Render) => T | Promise<T>, reserved: ReadonlySet<string> = new Set()): Promise<T> => {
  let taken = new Set(reserved);
  for (;;) {
    const r = newRender(taken);
    const out = await run(r);
    const clash = [...r.aliases].filter((a) => r.roots.has(a) && !taken.has(a));
    if (clash.length === 0) return out;
    taken = new Set([...taken, ...r.roots]);
  }
};
