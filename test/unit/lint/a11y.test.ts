import { describe, expect, it } from "vitest";
import { lint } from "./run.ts";

const codes = (html: string, code: string): number => lint(html, code).length;

describe("W015 link name", () => {
  it("flags an empty link and an icon link whose image has no alt", () => {
    expect(codes('<a href="/x"></a>', "W015")).toBe(1);
    expect(codes('<a href="/x"><img src="a.png" alt="" width="20" height="20"></a>', "W015")).toBe(1);
  });
  it("accepts text, aria-label, image alt and merge tags", () => {
    expect(codes('<a href="/x">Shop</a>', "W015")).toBe(0);
    expect(codes('<a href="/x" aria-label="Shop"></a>', "W015")).toBe(0);
    expect(codes('<a href="/x"><img src="a.png" alt="Shop" width="20" height="20"></a>', "W015")).toBe(0);
    expect(codes('<a href="/x">{{cta}}</a>', "W015")).toBe(0);
  });
  it("skips anchors without href and hidden links", () => {
    expect(codes('<a name="top"></a>', "W015")).toBe(0);
    expect(codes('<a href="/x" style="display:none"></a>', "W015")).toBe(0);
    expect(codes('<a href="/x" aria-hidden="true"></a>', "W015")).toBe(0);
  });
  it("points at the link", () => {
    expect(lint('<p>x</p>\n<a href="/x"></a>', "W015")[0]).toMatchObject({ severity: "warning", loc: { line: 2 } });
  });
});

describe("W016 contrast", () => {
  const p = (color: string, bg = "#ffffff", extra = "") => `<div style="background:${bg}"><p style="color:${color};${extra}">Hello</p></div>`;
  it("reports the ratio", () => {
    const [d] = lint(p("#999999"), "W016");
    expect(d?.message).toContain("found 2.8:1, needs 4.5:1");
    expect(d?.severity).toBe("warning");
  });
  it("passes good contrast", () => {
    expect(codes(p("#000000"), "W016")).toBe(0);
    expect(codes(p("#767676"), "W016")).toBe(0); // 4.54
  });
  it("uses the white the shell paints when nothing sets a background", () => {
    expect(codes('<p style="color:#999">x</p>', "W016")).toBe(1);
  });
  it("large text needs 3:1; 18.66px needs bold", () => {
    expect(codes(p("#999999", "#fff", "font-size:24px"), "W016")).toBe(1); // 2.8 < 3
    expect(codes(p("#8a8a8a", "#fff", "font-size:24px"), "W016")).toBe(0); // 3.4
    expect(codes(p("#8a8a8a", "#fff", "font-size:19px"), "W016")).toBe(1);
    expect(codes(p("#8a8a8a", "#fff", "font-size:19px;font-weight:700"), "W016")).toBe(0);
  });
  it("does not round: 4.499 fails", () => {
    // #767676 on white is 4.54; #777777 is 4.48
    expect(lint(p("#777777"), "W016")[0]?.message).toContain("found 4.4:1");
  });
  it("blends translucent colours onto the known background", () => {
    expect(codes(p("rgba(0,0,0,0.3)"), "W016")).toBe(1);
    expect(codes(p("rgba(0,0,0,0.9)"), "W016")).toBe(0);
    expect(codes(p("#ffffff", "rgba(0,0,0,0.9)"), "W016")).toBe(0);
  });
  it("checks against the background-color fallback of an image", () => {
    const bg = (c: string) => `<div style="background-color:${c};background-image:url(a.jpg)"><p style="color:#fff">Hi</p></div>`;
    expect(codes(bg("#ffee99"), "W016")).toBe(1);
    expect(codes(bg("#003366"), "W016")).toBe(0);
  });
  it("skips unknown backgrounds, hidden text and the preheader", () => {
    expect(codes('<div style="background-image:url(a.jpg)"><p style="color:#fff">Hi</p></div>', "W016")).toBe(0);
    expect(codes(p("#eee", "#fff", "display:none"), "W016")).toBe(0);
    expect(codes('<div data-email="preheader" style="color:#eee">Hi</div><p>x</p>', "W016")).toBe(0);
    expect(codes(p("transparent"), "W016")).toBe(0);
  });
  it("reports each colour pair once with a count", () => {
    const [d, ...rest] = lint('<p style="color:#999">a</p><p style="color:#999">b</p>', "W016");
    expect(rest).toEqual([]);
    expect(d?.message).toContain("(2 places)");
  });
  it("checks the element that holds the text, not its ancestors", () => {
    expect(codes('<div style="color:#999"><p style="color:#000">x</p></div>', "W016")).toBe(0);
  });
});

describe("I009 lang", () => {
  it("fires when the source set none", () => {
    expect(lint("<p>x</p>", "I009", { lang: undefined, dark: false })).toHaveLength(1);
  });
  it("stays quiet when the author set it, or when the compile didn't say", () => {
    expect(lint("<p>x</p>", "I009", { lang: "de", dark: false })).toEqual([]);
    expect(lint("<p>x</p>", "I009")).toEqual([]);
  });
});

describe("I010 vague link text", () => {
  it.each(["Click here", "read more", "Learn More.", "here", "Details »", "this link", "https://example.com/a", "www.example.com"])("flags %s", (t) => {
    expect(codes(`<a href="/x">${t}</a>`, "I010")).toBe(1);
  });
  it("skips descriptive text, aria-label and merge tags", () => {
    expect(codes('<a href="/x">Read the spring guide</a>', "I010")).toBe(0);
    expect(codes('<a href="/x" aria-label="Read more about the sale">Read more</a>', "I010")).toBe(0);
    expect(codes('<a href="/x">Read more about {{name}}</a>', "I010")).toBe(0);
    expect(codes('<a href="/x">See https://example.com/a for more</a>', "I010")).toBe(0);
  });
  it("is info", () => {
    expect(lint('<a href="/x">here</a>', "I010")[0]?.severity).toBe("info");
  });
});

describe("I011 headings", () => {
  it("flags a skipped level and a second h1", () => {
    expect(codes("<h2>a</h2><h4>b</h4>", "I011")).toBe(1);
    expect(codes("<h1>a</h1><h1>b</h1>", "I011")).toBe(1);
  });
  it("allows a missing h1, a first h3 and steps up or down", () => {
    expect(codes("<h2>a</h2><h3>b</h3><h2>c</h2><h4 style='display:none'>d</h4>", "I011")).toBe(0);
    expect(codes("<h3>a</h3>", "I011")).toBe(0);
    expect(codes("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>", "I011")).toBe(0);
  });
  it("ignores hidden headings", () => {
    expect(codes("<h1>a</h1><h1 style='display:none'>b</h1>", "I011")).toBe(0);
  });
  it("counts the branches of an if chain as alternatives", () => {
    const html = "<tddr-if test='a'><h1>a</h1></tddr-if><tddr-else><h1>b</h1></tddr-else>";
    expect(codes(html, "I011")).toBe(0);
    expect(codes(`${html}<h1>c</h1>`, "I011")).toBe(1);
  });
});

describe("I012 alt placeholder", () => {
  it.each(["logo.png", "IMG_1234", "DSC0456", "image", "Photo", "photo.jpg"])("flags alt=%s", (alt) => {
    expect(codes(`<img src="https://x.test/${alt === "photo.jpg" ? "photo.jpg" : "a.png"}" alt="${alt}" width="10" height="10">`, "I012")).toBe(1);
  });
  it("flags alt equal to the src file name", () => {
    expect(codes('<img src="https://x.test/img/banner-spring.png?v=2" alt="banner-spring.png" width="10" height="10">', "I012")).toBe(1);
  });
  it("skips real descriptions, empty alt and merge tags", () => {
    expect(codes('<img src="a.png" alt="A red kettle on a stove" width="10" height="10">', "I012")).toBe(0);
    expect(codes('<img src="a.png" alt="" width="10" height="10">', "I012")).toBe(0);
    expect(codes('<img src="a.png" alt="{{product.name}}" width="10" height="10">', "I012")).toBe(0);
    expect(codes('<img src="a.png" alt="Company logo" width="10" height="10">', "I012")).toBe(0);
  });
});

describe("I013 small text", () => {
  it("flags text under 12px", () => {
    expect(codes('<p style="font-size:11px">legal</p>', "I013")).toBe(1);
  });
  it("leaves 12px and up, hidden text, the preheader and spacers", () => {
    expect(codes('<p style="font-size:12px">ok</p>', "I013")).toBe(0);
    expect(codes('<p style="font-size:10px;display:none">hidden</p>', "I013")).toBe(0);
    expect(codes('<div data-email="preheader" style="font-size:10px">pre</div><p>x</p>', "I013")).toBe(0);
    expect(codes('<div style="font-size:1px;line-height:1px">&nbsp;</div>', "I013")).toBe(0);
    expect(codes('<div style="font-size:8px">&nbsp;</div>', "I013")).toBe(0);
  });
  it("reports once per size with a count", () => {
    const ds = lint('<p style="font-size:10px">a</p><p style="font-size:10px">b</p><p style="font-size:11px">c</p>', "I013");
    expect(ds).toHaveLength(2);
    expect(ds[0]?.message).toContain("(2 places)");
  });
});

describe("review fixes", () => {
  it("skips Outlook-only content", () => {
    const html = '<div data-email="outlook-only" style="font-size:10px;color:#eee">x</div>';
    expect(lint(html, "I013")).toEqual([]);
    expect(lint(html, "W016")).toEqual([]);
  });
  it("reads bgcolor as paint", () => {
    expect(lint('<table bgcolor="#111111"><tr><td style="color:#fff">x</td></tr></table>', "W016")).toEqual([]);
  });
  it("tells 4.499 from 4.5 and names the large-text threshold", () => {
    // #777777 on white is 4.48
    expect(lint('<p style="color:#777777">x</p>', "W016")).toHaveLength(1);
    expect(lint('<p style="color:#999999;font-size:24px">x</p>', "W016")[0]?.message).toContain("needs 3:1");
  });
  it("merges if branches for headings", () => {
    const branch = "<tddr-if test=\"a\"><h1>a</h1></tddr-if><tddr-else><p>b</p></tddr-else><h1>c</h1>";
    expect(lint(branch, "I011")).toHaveLength(1);
    const chain = '<tddr-if test="a"><h1>a</h1></tddr-if><h1 data-email-else-if="b">b</h1><tddr-else><h1>c</h1></tddr-else>';
    expect(lint(chain, "I011")).toEqual([]);
  });
});
