import type { Ctx } from "../ctx.ts";
import type { ColumnResolution, Fluid, Node, RowNode } from "../ir/index.ts";

// A pass takes a tree in phase In to phase Out (ir/phase.ts).
export type Pass<In extends Node = Node, Out extends Node = Node> = {
  readonly name: string;
  run(ir: In, ctx: Ctx): Out;
};

// one per column of the row; null where the table sizes the column (auto, or grow beside auto)
export type ResolvedColumns = ReadonlyArray<ColumnResolution>;

// `screen`: how the row's content box follows a narrow screen (default: it is the screen).
export interface WidthResolver {
  resolve(row: RowNode, available: number, ctx: Ctx, screen?: Fluid): ResolvedColumns;
}
