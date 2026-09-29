import { hasMergeTag, textOf, walk, type Check } from "./walk.ts";

const VAGUE = new Set(["click here", "here", "read more", "learn more", "more", "link", "this link", "click", "details"]);
const BARE_URL = /^(https?:\/\/|www\.)\S+$/i;

const plain = (s: string): string => s.toLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();

// I010: link text that means nothing when links are listed on their own.
export const linkText: Check = (body, ctx) => {
  walk(body, (el) => {
    if (el.tag !== "a" || el.attrs["href"] === undefined || (el.attrs["aria-label"] ?? "").trim() !== "") return;
    const text = textOf(el).trim();
    if (text === "" || hasMergeTag(text)) return;
    if (VAGUE.has(plain(text)) || BARE_URL.test(text)) ctx.diagnostics.report("I010", { message: `Link text "${text}" doesn't say where it goes`, loc: el.loc });
  });
};
