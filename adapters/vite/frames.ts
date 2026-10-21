import type { RunnableDevEnvironment } from "vite";

// A template error says the component line it came from (adapters/template/errors.ts). Vite's
// runner maps a frame to the last mapped point at or before it on its line; Vue's server render
// maps only a few points per line, so a frame before the first is left where the compiled code
// ran ("App.vue:38:45" in a 17-line file). Such a frame is placed at the line's first mapped
// point instead, or, on a line with none, said as the file alone.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGIT = new Map([...B64].map((c, i) => [c, i]));

// [column, source, line, column] of each mapped point on one line (0-based), from the start
// of the mappings, as the source and original fields count on across lines
const segmentsOn = (mappings: string, line: number): number[][] => {
  const state = [0, 0, 0, 0];
  let found: number[][] = [];
  mappings.split(";").some((text, at) => {
    state[0] = 0;
    const here: number[][] = [];
    for (const seg of text.split(",")) {
      if (seg === "") continue;
      const fields: number[] = [];
      let value = 0;
      let shift = 0;
      for (const c of seg) {
        const d = DIGIT.get(c) ?? 0;
        value += (d & 31) << shift;
        shift += 5;
        if (d & 32) continue;
        fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
        value = shift = 0;
      }
      fields.forEach((f, i) => (state[i] = state[i]! + f));
      if (fields.length >= 4) here.push([...state]);
    }
    if (at === line) found = here;
    return at === line;
  });
  return found;
};

type Located = Error & { at?: string; ranAt?: string };

export const placeFrame = (env: RunnableDevEnvironment, err: unknown): void => {
  const e = err as Located;
  // a frame the runner mapped differs from where it ran; that one stands
  if (!(err instanceof Error) || !e.at || e.at !== e.ranAt) return;
  const m = /^(.*):(\d+):(\d+)$/.exec(e.ranAt);
  if (!m) return;
  const [, file, line, col] = m as unknown as [string, string, string, string];
  let to = file;
  try {
    const map = env.runner.evaluatedModules.getModuleSourceMapById(file);
    const points = map ? segmentsOn(map.map.mappings ?? "", Number(line) - 1) : [];
    const point = points.findLast((p) => p[0]! <= Number(col) - 1) ?? points[0];
    const source = point && map!.resolvedSources[point[1]!];
    if (point && source) to = `${source}:${point[2]! + 1}:${point[3]! + 1}`;
  } catch {
    // no map to read: the file alone, rather than a line that isn't in it
  }
  e.message = e.message.replace(`\n    at ${e.at}`, `\n    at ${to}`);
};
