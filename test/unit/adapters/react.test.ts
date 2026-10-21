import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "../../../adapters/react/index.ts";

const Card = ({ title, src }: { title: string; src: string }) =>
  createElement("div", { className: "card" }, createElement("img", { src, alt: "" }), createElement("p", null, title));

describe("react adapter", () => {
  it("renders static markup with the props", () => {
    expect(render(Card, { title: "Hi", src: "a.png" })).toBe('<div class="card"><img src="a.png" alt=""/><p>Hi</p></div>');
  });

  it("drops the image preloads React adds, keeps links the author wrote", () => {
    const Page = () =>
      createElement("div", null, createElement("link", { rel: "stylesheet", href: "x.css" }), createElement("img", { src: "b.png", srcSet: "b2.png 2x" }));
    const html = render(Page, {});
    expect(html).not.toContain("preload");
    expect(html).toContain(`<link rel="stylesheet" href="x.css"/>`);
    expect(html).toContain('<img src="b.png" srcSet="b2.png 2x"/>');
  });
});
