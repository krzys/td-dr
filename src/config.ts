// tddr.config.ts: the options a project builds every email with, under the library's names. Flags
// given on the command line win.
export type TddrConfig = {
  targets?: string[];
  width?: number;
  baseUrl?: string; // folder builds and dev
};

export const defineConfig = (config: TddrConfig): TddrConfig => config;

// What a config file exported, checked; the message names the key and what it should be.
export const checkConfig = (value: unknown): TddrConfig => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("the default export must be an object, like defineConfig({ … })");
  const config = value as Record<string, unknown>;
  for (const key of Object.keys(config)) {
    if (!["targets", "width", "baseUrl"].includes(key)) throw new Error(`unknown key "${key}"; expected targets, width or baseUrl`);
  }
  const { targets, width, baseUrl } = config;
  if (targets !== undefined && !(Array.isArray(targets) && targets.every((t) => typeof t === "string" && t.trim() !== "")))
    throw new Error(`targets must be an array of target names, got ${JSON.stringify(targets)}`);
  if (width !== undefined && !(Number.isInteger(width) && (width as number) >= 1)) throw new Error(`width must be a positive integer, got ${JSON.stringify(width)}`);
  if (baseUrl !== undefined && !(typeof baseUrl === "string" && baseUrl !== "")) throw new Error(`baseUrl must be a URL, got ${JSON.stringify(baseUrl)}`);
  return config as TddrConfig;
};
