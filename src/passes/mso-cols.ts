import { isOutlookOnlyCol as isMsoCol, type RowNode } from "../ir/index.ts";

// Runs `fn` on the row as if its Outlook-only cells weren't there, then puts them back where they were.
export const withoutMsoCols = (row: RowNode, fn: (kept: RowNode) => RowNode): RowNode => {
  if (!row.cols.some(isMsoCol)) return fn(row);
  const lowered = fn({ ...row, cols: row.cols.filter((c) => !isMsoCol(c)) });
  let k = 0;
  return { ...lowered, cols: row.cols.map((c) => (isMsoCol(c) ? c : lowered.cols[k++]!)) };
};
