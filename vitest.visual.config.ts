import { defineConfig } from "vitest/config";

export const config = defineConfig({
  test: {
    include: ["test/harness/**/*.visual.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

// vitest only reads a default export.
export default config;
