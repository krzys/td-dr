import { defineConfig } from "vitest/config";

export const config = defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/harness/**/*.test.ts"],
    exclude: ["test/harness/**/*.visual.test.ts", "**/node_modules/**"],
  },
});

// vitest only reads a default export.
export default config;
