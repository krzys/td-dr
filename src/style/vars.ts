// var() substitution. A value that can't be resolved comes back undefined.

export const hasVar = (v: string): boolean => /(?<![\w-])var\(/i.test(v);

type Lookup = (name: string) => string | undefined;

export const substituteVars = (value: string, lookup: Lookup): string | undefined => {
  const re = /(?<![\w-])var\(/gi;
  let out = "";
  let pos = 0;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let end = start;
    let comma = -1;
    for (; end < value.length && depth > 0; end++) {
      const ch = value[end];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 1 && comma < 0) comma = end;
    }
    if (depth > 0) return undefined;
    const name = value.slice(start, comma < 0 ? end - 1 : comma).trim();
    const fallback = comma < 0 ? undefined : value.slice(comma + 1, end - 1).trim();
    if (!name.startsWith("--")) return undefined;
    let hit = lookup(name);
    if (hit === undefined && fallback !== undefined) hit = substituteVars(fallback, lookup);
    if (hit === undefined) return undefined;
    out += value.slice(pos, m.index) + hit;
    pos = end;
    re.lastIndex = end;
  }
  return out + value.slice(pos);
};

// Custom props can reference each other. `base` is what was inherited.
// Cycles and unresolved references end up in `failed`.
export const resolveCustomProps = (
  own: Readonly<Record<string, string>>,
  base: Readonly<Record<string, string>>,
): { values: Record<string, string>; failed: string[] } => {
  const done = new Map<string, string | undefined>();
  const stack: string[] = [];
  const cyclic = new Set<string>();
  const lookup: Lookup = (name) => {
    if (!(name in own)) return base[name];
    if (done.has(name)) return done.get(name);
    const at = stack.indexOf(name);
    if (at >= 0) {
      // everything from here up the stack is in the cycle, fallbacks don't save it
      for (const n of stack.slice(at)) cyclic.add(n);
      return undefined;
    }
    stack.push(name);
    const raw = own[name] ?? "";
    const v = hasVar(raw) ? substituteVars(raw, lookup) : raw;
    stack.pop();
    const result = cyclic.has(name) ? undefined : v;
    done.set(name, result);
    return result;
  };
  const values: Record<string, string> = {};
  const failed: string[] = [];
  for (const name of Object.keys(own)) {
    const v = lookup(name);
    if (v === undefined) failed.push(name);
    else values[name] = v;
  }
  return { values, failed };
};
