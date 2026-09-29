import { describe, expect, it } from "vitest";
import { gif, lint, png, trns } from "./run.ts";

const img = (src: string, around = "#ffffff", attrs = 'width="80" height="40"') => `<div style="background:${around}"><img src="${src}" alt="Birch" ${attrs}></div>`;

describe("W017 transparent image", () => {
  it("flags alpha PNGs, tRNS PNGs, transparent GIFs and SVGs on a light background", () => {
    expect(lint(img(png(6)), "W017")).toHaveLength(1);
    expect(lint(img(png(4)), "W017")).toHaveLength(1);
    expect(lint(img(png(3, [trns()])), "W017")).toHaveLength(1);
    expect(lint(img(gif(true)), "W017")).toHaveLength(1);
    expect(lint(img("data:image/svg+xml;utf8,%3Csvg%2F%3E"), "W017")).toHaveLength(1);
  });
  it("leaves opaque images", () => {
    expect(lint(img(png(2)), "W017")).toEqual([]);
    expect(lint(img(png(3)), "W017")).toEqual([]);
    expect(lint(img(gif(false)), "W017")).toEqual([]);
  });
  it("leaves dark and unknown backgrounds, tracking pixels and remote images", () => {
    expect(lint(img(png(6), "#111111"), "W017")).toEqual([]);
    expect(lint('<div style="background-image:url(a.jpg)"><img src="' + png(6) + '" alt="x" width="80" height="40"></div>', "W017")).toEqual([]);
    expect(lint(img(png(6), "#ffffff", 'width="1" height="1"'), "W017")).toEqual([]);
    expect(lint('<img src="https://x.test/logo.png" alt="Birch" width="80" height="40">', "W017")).toEqual([]);
  });
  it("treats no background as the white the shell paints", () => {
    expect(lint(`<img src="${png(6)}" alt="Birch" width="80" height="40">`, "W017")).toHaveLength(1);
  });
});

describe("I014 dark design", () => {
  const dark = { lang: "en", dark: false };
  it("flags a dark root, or a dark outermost wrapper, without a dark-mode rule", () => {
    expect(lint('<div style="background:#111"><p>x</p></div>', "I014", dark)).toHaveLength(1);
    expect(lint('<div><div style="background:#0b1220"><p>x</p><p>y</p></div></div>', "I014", dark)).toHaveLength(1);
  });
  it("is quiet with a dark-mode rule, a light design or no document info", () => {
    expect(lint('<div style="background:#111"><p>x</p></div>', "I014", { lang: "en", dark: true })).toEqual([]);
    expect(lint('<div style="background:#fafafa"><p>x</p></div>', "I014", dark)).toEqual([]);
    expect(lint('<div style="background:#111"><p>x</p></div>', "I014")).toEqual([]);
  });
  it("leaves a dark band in a light email, a grey page around a white card, and dark buttons", () => {
    expect(lint('<div style="background:#fff"><div style="background:#111"><p>x</p></div><p>y</p><p>z</p></div>', "I014", dark)).toEqual([]);
    expect(lint('<div style="background:#334155"><div style="background:#fff"><p>x</p><p>y</p></div></div>', "I014", dark)).toEqual([]);
    expect(lint('<div><a href="/x" style="display:inline-block;background:#111;color:#fff">Shop</a></div>', "I014", dark)).toEqual([]);
  });
  it("reports the element that painted the dark background", () => {
    const [d] = lint('<div>\n<div style="background:#0b1220"><p>x</p></div></div>', "I014", dark);
    expect(d?.loc?.line).toBe(2);
  });
});

describe("review fixes", () => {
  it("survives a raw % in a URL-encoded svg and still warns", () => {
    const src = "data:image/svg+xml;utf8,<svg width='100%'></svg>";
    expect(lint(`<img src="${src}" alt="Logo" width="100" height="40">`, "W017")).toHaveLength(1);
  });
  it("skips a png whose escapes are malformed", () => {
    expect(lint('<img src="data:image/png;utf8,100%" alt="x" width="10" height="10">', "W017")).toEqual([]);
  });
});

describe("W017 svg backgrounds", () => {
  const svg = (body: string, attrs = 'width="80" height="40"') => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`)}`;
  it("leaves an svg whose first shape is a filled rect over the whole canvas", () => {
    expect(lint(img(svg('<rect width="100%" height="100%" fill="#5b21b6"/><path d="M0 0h8"/>')), "W017")).toEqual([]);
    expect(lint(img(svg('<title>Birch</title><rect width="80" height="40" fill="#fff"/>')), "W017")).toEqual([]);
    expect(lint(img(svg('<rect width="200" height="100" fill="#fff"/>', 'viewBox="0 0 200 100"')), "W017")).toEqual([]);
  });
  it("flags one whose rect is partial, unfilled, offset, or not first", () => {
    expect(lint(img(svg('<rect width="40" height="40" fill="#fff"/>')), "W017")).toHaveLength(1);
    expect(lint(img(svg('<rect width="100%" height="100%" fill="none"/>')), "W017")).toHaveLength(1);
    expect(lint(img(svg('<rect x="4" width="100%" height="100%" fill="#fff"/>')), "W017")).toHaveLength(1);
    expect(lint(img(svg('<circle r="20" fill="#5b21b6"/><rect width="100%" height="100%" fill="#fff"/>')), "W017")).toHaveLength(1);
  });
});
