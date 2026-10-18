// One table for both input lint and output self-lint, backed by
// the vendored caniemail data (docs/support.md#targets-and-client-data). Never fetched at runtime.
import data from "./data/caniemail.json" with { type: "json" };
import { PRESETS, type Pair } from "./presets.ts";

// y yes, a partial, n no, u untested
export type Status = "y" | "a" | "n" | "u";

export type Resolution = {
  status: Status; // worst across the targets' clients: n > a > u > y
  clients: string[]; // display names of the clients that aren't "y"
  unsupported: string[]; // the subset that is "n"
  notes: string[]; // caniemail notes for those clients
};

export interface Capabilities {
  readonly targets: readonly string[];
  // `slug` is a caniemail feature, e.g. "css-border-radius"
  check(slug: string): Resolution;
}

// vendored notes we can't pass on as written; kept here so a data refresh doesn't undo them
const NOTE_FIXES: ReadonlyArray<readonly [string, string]> = [
  // the buttons.cm generator no longer works
  ["See [buttons.cm](https://buttons.cm/) and [VML documentation]", "See the [VML documentation]"],
];
const fixNote = (text: string) => NOTE_FIXES.reduce((t, [from, to]) => t.replace(from, to), text);

export const DEFAULT_TARGETS: readonly string[] = ["broad"];

export type CaniemailData = {
  nicenames: { family: Record<string, string>; platform: Record<string, string> };
  data: Array<{
    slug: string;
    notes_by_num?: Record<string, string> | null;
    stats: Record<string, Record<string, Record<string, string>>>;
  }>;
};

// the CLI turns this one (and only this one) into exit code 2
export class UnknownTargetError extends Error {}

const VALUE = /^([yanu])((?: #\d+)*)$/;
const DATE = /^\d{4}-\d{2}$/;
const YEAR = /^\d{4}$/;
const RANK: Record<Status, number> = { y: 0, u: 1, a: 2, n: 3 };

const parts = (v: string): number[] => v.split(/[.-]/).map(Number);
const compareVersions = (a: string, b: string): number => {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

type Kind = "date" | "year" | "version";
const kindOf = (k: string): Kind => (DATE.test(k) ? "date" : YEAR.test(k) ? "year" : "version");

// Keys mix product years ("2019"), build numbers ("16.80", "15") and test dates
// ("2024-10"); the kinds don't order against each other. Dict order is
// chronological, so the kind of the last key decides which kind we sort.
// With maxVersion (classic Outlook pinned to a product year) only year keys at
// or below it count; if the row has no year keys at all (e.g. date-only rows) we fall back to
// the latest row rather than reporting "u" for data that exists.
export const latestVersion = (versions: string[], maxVersion?: number): string | undefined => {
  let keys = versions;
  if (maxVersion !== undefined) {
    const years = versions.filter((k) => kindOf(k) === "year");
    if (years.length) keys = years.filter((k) => Number(k) <= maxVersion);
  }
  const last = keys.at(-1);
  if (last === undefined) return undefined;
  const kind = kindOf(last);
  return keys.filter((k) => kindOf(k) === kind).reduce((best, k) => (compareVersions(k, best) > 0 ? k : best));
};

const expand = (target: string, db: CaniemailData): Pair[] => {
  const preset = Object.hasOwn(PRESETS, target) ? PRESETS[target] : undefined;
  if (preset) return preset;
  const [family, platform, ...rest] = target.split("/");
  if (family && rest.length === 0) {
    const platforms = new Set<string>();
    for (const f of db.data) {
      for (const p of Object.keys(f.stats[family] ?? {})) platforms.add(p);
    }
    const pairs = [...platforms]
      .filter((p) => platform === undefined || p === platform)
      .map((p) => ({ family, platform: p }));
    if (pairs.length) return pairs;
  }
  throw new UnknownTargetError(
    `Unknown target "${target}". Known: ${Object.keys(PRESETS).join(", ")}, or a caniemail family or family/platform`,
  );
};

export const createCapabilities = (db: CaniemailData, targets: readonly string[]): Capabilities => {
  if (targets.length === 0) throw new UnknownTargetError("No targets given. Pass at least one, e.g. broad");
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  for (const t of targets) {
    for (const p of expand(t, db)) {
      const key = `${p.family}/${p.platform}/${p.maxVersion ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push(p);
      }
    }
  }
  const bySlug = new Map(db.data.map((f) => [f.slug, f]));
  const cache = new Map<string, Resolution>();

  const compute = (slug: string): Resolution => {
    const feature = bySlug.get(slug);
    if (!feature) return { status: "u", clients: [], unsupported: [], notes: [] };
    let status: Status = "y";
    const clients = new Set<string>();
    const unsupported = new Set<string>();
    // notes for "n" clients come first, they explain the worst status
    const notesN = new Set<string>();
    const notes = new Set<string>();
    for (const p of pairs) {
      const rows = feature.stats[p.family]?.[p.platform];
      const version = rows && latestVersion(Object.keys(rows), p.maxVersion);
      const m = rows && version !== undefined ? VALUE.exec(rows[version]!) : null;
      const s = (m?.[1] as Status | undefined) ?? "u";
      if (s === "y") continue;
      if (RANK[s] > RANK[status]) status = s;
      const fam = db.nicenames.family[p.family] ?? p.family;
      const plat = db.nicenames.platform[p.platform] ?? p.platform;
      const name = plat.startsWith(fam) ? plat : `${fam} ${plat}`; // not "Outlook Outlook.com"
      clients.add(name);
      if (s === "n") unsupported.add(name);
      for (const ref of m?.[2]?.match(/\d+/g) ?? []) {
        const text = feature.notes_by_num?.[ref];
        if (text) (s === "n" ? notesN : notes).add(fixNote(text));
      }
    }
    return { status, clients: [...clients], unsupported: [...unsupported], notes: [...new Set([...notesN, ...notes])] };
  };

  return {
    targets,
    check(slug) {
      let r = cache.get(slug);
      if (!r) cache.set(slug, (r = compute(slug)));
      return r;
    },
  };
};

export const loadCapabilities = (targets: readonly string[]): Capabilities =>
  createCapabilities(data as unknown as CaniemailData, targets);
