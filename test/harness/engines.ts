// The browser engines the visual tests run in. TDDR_ENGINE picks one for the whole run;
// chromium is the default, so a local `pnpm test:visual` stays as fast as it was.
export const ENGINES = ["chromium", "firefox", "webkit"] as const;
export type Engine = (typeof ENGINES)[number];

export const isEngine = (name: unknown): name is Engine => ENGINES.includes(name as Engine);

export const engineFromEnv = (env: Record<string, string | undefined> = process.env): Engine => {
  const name = env.TDDR_ENGINE || "chromium";
  if (!isEngine(name)) throw new Error(`TDDR_ENGINE must be one of ${ENGINES.join(", ")}, got "${name}"`);
  return name;
};

export const ENGINE: Engine = engineFromEnv();
