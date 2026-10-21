// Static arithmetic for calc() / min() / max() / clamp(). A value is a number or a length;
// a length is linear, P% + Npx, so calc(50% - 0.5rem) folds to calc(50% - 8px) (docs/support.md#flex-rows).

export type Val = { d: "num"; n: number } | { d: "len"; pct: number; px: number };
// px for a unit, undefined if it isn't a resolvable length
export type UnitPx = (unit: string) => number | undefined;

const TOKEN = /\s*(?:([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|[a-z]+)?|((?:-\w+-)?(?:calc|min|max|clamp))\(|([()*/,+-]))/iy;

const scale = (v: Val, k: number): Val => (v.d === "num" ? { d: "num", n: v.n * k } : { d: "len", pct: v.pct * k, px: v.px * k });

const add = (a: Val, b: Val, sign: number): Val | undefined => {
  if (a.d === "num" && b.d === "num") return { d: "num", n: a.n + sign * b.n };
  if (a.d === "len" && b.d === "len") return { d: "len", pct: a.pct + sign * b.pct, px: a.px + sign * b.px };
  return undefined;
};

// min/max/clamp only compare values of one kind: all numbers, all px or all %
const comparable = (vs: Val[]): { ns: number[]; make: (n: number) => Val } | undefined => {
  if (vs.every((v) => v.d === "num")) return { ns: vs.map((v) => v.n), make: (n) => ({ d: "num", n }) };
  const lens = vs.filter((v) => v.d === "len");
  if (lens.length !== vs.length) return undefined;
  if (lens.every((v) => v.pct === 0)) return { ns: lens.map((v) => v.px), make: (px) => ({ d: "len", pct: 0, px }) };
  if (lens.every((v) => v.px === 0)) return { ns: lens.map((v) => v.pct), make: (pct) => ({ d: "len", pct, px: 0 }) };
  return undefined;
};

export const evalMath = (expr: string, unitPx: UnitPx): Val | undefined => {
  const toks: Array<{ v?: Val; fn?: string; op?: string }> = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < expr.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(expr);
    if (!m) return /^\s*$/.test(expr.slice(pos)) ? finish() : undefined;
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) {
      const n = Number(m[1]);
      const u = m[2]?.toLowerCase();
      if (u === undefined) toks.push({ v: { d: "num", n } });
      else if (u === "%") toks.push({ v: { d: "len", pct: n, px: 0 } });
      else {
        const k = unitPx(u);
        if (k === undefined) return undefined;
        toks.push({ v: { d: "len", pct: 0, px: n * k } });
      }
    } else if (m[3]) toks.push({ fn: m[3].toLowerCase().replace(/^-\w+-/, "") });
    else toks.push({ op: m[4]! });
  }
  return finish();

  function finish(): Val | undefined {
    let i = 0;
    const peek = () => toks[i];
    const sum = (): Val | undefined => {
      let a = product();
      while (a && (peek()?.op === "+" || peek()?.op === "-")) {
        const op = toks[i++]!.op;
        const b = product();
        a = b && add(a, b, op === "+" ? 1 : -1);
      }
      return a;
    };
    const product = (): Val | undefined => {
      let a = atom();
      while (a && (peek()?.op === "*" || peek()?.op === "/")) {
        const op = toks[i++]!.op;
        const b = atom();
        if (!b) return undefined;
        if (op === "*") {
          if (a.d === "num") a = scale(b, a.n);
          else if (b.d === "num") a = scale(a, b.n);
          else return undefined;
        } else {
          if (b.d !== "num" || b.n === 0) return undefined;
          a = scale(a, 1 / b.n);
        }
      }
      return a;
    };
    const args = (): Val[] | undefined => {
      const out: Val[] = [];
      for (;;) {
        const v = sum();
        if (!v) return undefined;
        out.push(v);
        const t = toks[i++];
        if (t?.op === ")") return out;
        if (t?.op !== ",") return undefined;
      }
    };
    const atom = (): Val | undefined => {
      const t = toks[i++];
      if (!t) return undefined;
      if (t.v) return t.v;
      if (t.op === "(") {
        const v = sum();
        return toks[i++]?.op === ")" ? v : undefined;
      }
      if (!t.fn) return undefined;
      const a = args();
      if (!a) return undefined;
      if (t.fn === "calc") return a.length === 1 ? a[0] : undefined;
      const c = comparable(a);
      if (!c) return undefined;
      if (t.fn === "min") return c.make(Math.min(...c.ns));
      if (t.fn === "max") return c.make(Math.max(...c.ns));
      return a.length === 3 ? c.make(Math.max(c.ns[0]!, Math.min(c.ns[1]!, c.ns[2]!))) : undefined;
    };
    const v = sum();
    return v && i === toks.length ? v : undefined;
  }
};
