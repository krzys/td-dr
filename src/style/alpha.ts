// Translucent colours over a known solid colour become the colour you'd see, so clients
// without rgba (Outlook, parts of Gmail) show the same thing. Over images or gradients they stay.
export type RGB = [number, number, number];
type RGBA = [number, number, number, number];

// The 148 CSS named colours as name:rrggbb.
const NAMED: Readonly<Record<string, RGB>> = Object.fromEntries(
  `
  aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4
  black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0
  chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff
  darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b
  darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a
  darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1
  darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222
  floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520
  gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082
  ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6
  lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3
  lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899
  lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6
  magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db
  mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585
  midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6
  olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98
  paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd
  powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513
  salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb
  slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c
  teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5
  yellow:ffff00 yellowgreen:9acd32
`
    .trim()
    .split(/\s+/)
    .map((e) => {
      const [name, hex] = e.split(":");
      return [name!, [0, 2, 4].map((i) => Number.parseInt(hex!.slice(i, i + 2), 16)) as RGB];
    }),
);

const HUE_UNIT: Readonly<Record<string, number>> = { "": 1, deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

// CSS Color 4 §7.1; s and l are 0-100, h in degrees.
const hslToRgb = (h: number, s: number, l: number): RGB => {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => Math.round((lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255);
  return [f(0), f(8), f(4)];
};

// the comma form needs % on s and l; only the space form takes bare numbers
const HSL_COMMA = /^hsla?\(\s*(-?[\d.]+)(deg|grad|rad|turn)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+%?)\s*)?\)$/;
const HSL_SPACE = /^hsla?\(\s*(-?[\d.]+)(deg|grad|rad|turn)?\s+([\d.]+)%?\s+([\d.]+)%?\s*(?:\/\s*([\d.]+%?)\s*)?\)$/;

const num = (s: string, max: number): number => (s.endsWith("%") ? (Number.parseFloat(s) / 100) * max : Number.parseFloat(s));

export const parseColor = (c: string): RGBA | undefined => {
  const v = c.trim().toLowerCase();
  const named = Object.hasOwn(NAMED, v) ? NAMED[v] : undefined;
  if (named) return [...named, 1];
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((h) => h + h).join("") : hex;
    const [r, g, b, a] = [0, 2, 4, 6].map((i) => Number.parseInt(full.slice(i, i + 2) || "ff", 16));
    return [r!, g!, b!, Math.round((a! / 255) * 1000) / 1000];
  }
  const hsl = HSL_COMMA.exec(v) ?? HSL_SPACE.exec(v);
  if (hsl) {
    const hue = ((Number.parseFloat(hsl[1]!) * HUE_UNIT[hsl[2] ?? ""]!) % 360 + 360) % 360;
    return [...hslToRgb(hue, Number.parseFloat(hsl[3]!), Number.parseFloat(hsl[4]!)), hsl[5] === undefined ? 1 : num(hsl[5], 1)];
  }
  const fn = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(v);
  if (!fn) return undefined;
  return [num(fn[1]!, 255), num(fn[2]!, 255), num(fn[3]!, 255), fn[4] === undefined ? 1 : num(fn[4], 1)];
};

const hex2 = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

export const flatten = (c: string, behind: RGB): string => {
  const p = parseColor(c);
  if (!p || p[3] >= 1 || p[3] <= 0) return c;
  const a = p[3];
  return `#${[0, 1, 2].map((i) => hex2(p[i]! * a + behind[i]! * (1 - a))).join("")}`;
};

// What's behind an element's content: its own solid background, else what was behind it.
// undefined once a gradient, photo or unresolvable colour is in the way.
export const backdropOf = (style: Readonly<Record<string, string>>, behind: RGB | undefined): RGB | undefined => {
  const image = style["background-image"];
  if (image && image !== "none") return undefined;
  const bg = style["background-color"];
  if (!bg || bg === "transparent") return behind;
  const p = parseColor(behind ? flatten(bg, behind) : bg);
  if (!p) return undefined;
  if (p[3] <= 0) return behind;
  return p[3] >= 1 ? [p[0], p[1], p[2]] : undefined;
};

const FOREGROUND = /^(color|border-(top|right|bottom|left)-color|text-decoration-color|outline-color)$/;

// Colours among `props` that are still see-through after flattening.
export const translucentLeft = (style: Readonly<Record<string, string>>, props: Iterable<string>): string[] => {
  const out: string[] = [];
  for (const p of props) {
    const v = style[p];
    const a = v !== undefined && (p === "background-color" || FOREGROUND.test(p)) ? parseColor(v)?.[3] : undefined;
    if (a !== undefined && a > 0 && a < 1) out.push(`${p}: ${v}`);
  }
  return out;
};

export const flattenStyle = <S extends Readonly<Record<string, string>>>(style: S, behind: RGB | undefined): S => {
  let out: Record<string, string> | undefined;
  const set = (p: string, v: string) => {
    if (v !== style[p]) (out ??= { ...style })[p] = v;
  };
  const bg = style["background-color"];
  if (bg && behind) set("background-color", flatten(bg, behind));
  const front = backdropOf(style, behind);
  if (front) for (const [p, v] of Object.entries(style)) if (FOREGROUND.test(p)) set(p, flatten(v, front));
  return (out ?? style) as S;
};
