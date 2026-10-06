import type { ReactNode } from "react";
import { cond, templateError } from "../template/index.ts";
import { BLOCK_KIND, toNode } from "./blocks.ts";

type Children = { children?: unknown };

const kind = <F extends object>(f: F, k: string): F => Object.assign(f, { [BLOCK_KIND]: k });

const orphan = (name: string) => () => {
  throw templateError(`<${name}>`, "isn't right after an <If> or <ElseIf> in the same children.", "put it directly after the <If> (or <ElseIf>) it continues");
};

// The escape hatch (docs/templates.md): `when` is a native expression, a boolean on real data and a
// recorded condition in a template. A run of If, ElseIf and Else in one children list is one chain.
export const If = kind(({ when, children }: Children & { when: unknown }) => toNode(cond(when, () => children, () => null)) as ReactNode, "if");
export const ElseIf = kind(orphan("ElseIf") as (p: Children & { when: unknown }) => ReactNode, "else-if");
export const Else = kind(orphan("Else") as (p: Children) => ReactNode, "else");

// children is a function of each item, as with `of.map(children)`
export const Each = <T>({ of, children }: { of: readonly T[]; children: (item: T, index: number) => unknown }) => toNode(of.map(children)) as ReactNode;
