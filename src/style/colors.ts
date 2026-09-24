// Modern colour functions -> hex / rgba(), which every client reads. lightningcss does the
// colour maths into lab(); we take lab to sRGB ourselves so out-of-gamut colours clip like
// Chromium does, where lightningcss would gamut-map them.
import { transform } from "lightningcss";
import { mapUnprotected, PROTECTED } from "./units.ts";

export const MODERN_COLOR = /(?<![\w-])(?:oklch|oklab|lab|lch|hwb|color|color-mix)\(/i;
// what we lower: the modern ones, and rgb()/hsl() with a space-syntax alpha so alpha.ts can read them
const LOWERED = /(?<![\w-])(oklch|oklab|lab|lch|hwb|color|color-mix|hsla?|rgba?)\(/gi;

export const unquoted = (value: string): string => value.replace(new RegExp(PROTECTED, "gi"), '""');

export const hasModernColor = (value: string): boolean => MODERN_COLOR.test(unquoted(value));

const D50: readonly number[] = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
// Bradford D50 -> D65, then XYZ D65 -> linear sRGB (CSS Color 4 sample code)
const BRADFORD = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
const XYZ_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const mul = (m: number[][], v: number[]): number[] => m.map((row) => row.reduce((s, k, i) => s + k * v[i]!, 0));

const labToRgb = (l: number, a: number, b: number): number[] => {
  const k = 24389 / 27;
  const e = 216 / 24389;
  const fy = (l + 16) / 116;
  const f = [a / 500 + fy, fy, fy - b / 200];
  const xyz = f.map((c, i) => (i === 1 ? (l > k * e ? fy ** 3 : l / k) : c ** 3 > e ? c ** 3 : (116 * c - 16) / k) * D50[i]!);
  return mul(XYZ_SRGB, mul(BRADFORD, xyz)).map((c) => {
    const g = Math.abs(c) > 0.0031308 ? Math.sign(c) * (1.055 * Math.abs(c) ** (1 / 2.4) - 0.055) : 12.92 * c;
    return Math.round(Math.min(1, Math.max(0, g)) * 255);
  });
};

// the shortest alpha that is the same 8-bit value: 0.5 for lightningcss's .501961
const shortAlpha = (a: number): string => {
  const byte = Math.round(a * 255);
  for (let d = 1; d < 4; d++) {
    const s = Math.round(a * 10 ** d) / 10 ** d;
    if (Math.round(s * 255) === byte) return String(s);
  }
  return String(Math.round(a * 1000) / 1000);
};

const LAB = /^lab\(\s*(-?[\d.]+(?:e-?\d+)?)%\s+(-?[\d.]+(?:e-?\d+)?)\s+(-?[\d.]+(?:e-?\d+)?)\s*(?:\/\s*([\d.]+(?:e-?\d+)?)\s*)?\)$/;

const cache = new Map<string, string>();

// One colour function; undefined if lightningcss can't compute it.
const lowerOne = (fn: string): string | undefined => {
  let out = cache.get(fn);
  if (out === undefined) {
    out = "";
    try {
      const css = transform({
        filename: "v.css",
        code: Buffer.from(`a{color:lab(from ${fn} l a b / alpha)}`),
        targets: { safari: 15 << 16 }, // keeps lab() as lab()
      }).code.toString();
      const m = LAB.exec(/color:\s*([^;}]+)/.exec(css)?.[1]?.trim() ?? "");
      if (m) {
        const rgb = labToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
        const a = m[4] === undefined ? 1 : Number(m[4]);
        out = a >= 1 ? `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}` : `rgba(${rgb.join(", ")}, ${shortAlpha(a)})`;
      }
    } catch {
      // unparseable: keep as authored
    }
    cache.set(fn, out);
  }
  return out || undefined;
};

// Returns the value with colours lowered; one we can't lower comes back unchanged
// (computeValues drops it with a W001). `current` is what currentColor means here.
export const lowerColors = (value: string, current?: string): string =>
  mapUnprotected(value, (part) => {
    let out = "";
    let at = 0;
    LOWERED.lastIndex = 0;
    for (let m = LOWERED.exec(part); m; m = LOWERED.exec(part)) {
      let depth = 0;
      let end = m.index + m[0].length - 1;
      for (; end < part.length; end++) {
        if (part[end] === "(") depth++;
        else if (part[end] === ")" && --depth === 0) break;
      }
      if (end >= part.length) break;
      const fn = part.slice(m.index, end + 1);
      LOWERED.lastIndex = end + 1;
      // rgb(1 2 3), hsl(0, 100%, 50%) and rgba(0,0,0,.5) are fine as they are
      if (/^(rgb|hsl)a?\(/i.test(fn) && !fn.includes("/")) continue;
      const src = current ? fn.replace(/(?<![\w-])currentcolor(?![\w-])/gi, current) : fn;
      const low = lowerOne(src);
      if (low === undefined) continue;
      out += part.slice(at, m.index) + low;
      at = end + 1;
    }
    return out + part.slice(at);
  });
