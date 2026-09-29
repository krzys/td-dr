import type { StyledElement } from "../style/types.ts";
import { MARKER_DATA } from "../template/tokens.ts";
import { isInvisible, type Check } from "./walk.ts";

const LEVEL = /^h([1-6])$/;

type State = { last: number; h1s: number };

// I011: a skipped level or a second h1. A missing h1 is fine.
// The branches of an if chain are alternatives, so each one starts from where the chain began.
export const headings: Check = (body, ctx) => {
  let at: State = { last: 0, h1s: 0 };
  const chains: { start: State; done: State[] }[] = [];

  const visit = (el: StyledElement): void => {
    // a desktop and a mobile copy of one heading: count the one this screen shows
    if (isInvisible(el) || el.keep === "hidden") return;
    const level = Number(LEVEL.exec(el.tag)?.[1]);
    if (level) {
      if (level === 1 && at.h1s >= 1) ctx.diagnostics.report("I011", { message: "A second <h1>; an email has one", loc: el.loc });
      else if (at.last > 0 && level > at.last + 1) ctx.diagnostics.report("I011", { message: `<h${level}> follows <h${at.last}>, skipping a level`, loc: el.loc });
      at = { last: level, h1s: at.h1s + (level === 1 ? 1 : 0) };
    }
    for (const c of el.children) {
      if (c.type === "element") visit(c);
      else if (c.type === "comment") {
        const m = MARKER_DATA.exec(c.data);
        if (m?.[2] !== "if" && m?.[2] !== "elseif" && m?.[2] !== "else") continue;
        const chain = chains.at(-1);
        if (m[2] === "if" && !m[1]) chains.push({ start: at, done: [] });
        else if (!chain) continue;
        else if (m[1]) {
          // after the chain any branch may have run
          const all = [...chain.done, at];
          at = { last: Math.max(...all.map((s) => s.last)), h1s: Math.max(...all.map((s) => s.h1s)) };
          chains.pop();
        } else {
          chain.done.push(at);
          at = chain.start;
        }
      }
    }
  };
  visit(body);
};
