import { describe, expect, test } from "vitest";
import { engineFromEnv } from "./engines.ts";

describe("engineFromEnv", () => {
  test("chromium unless TDDR_ENGINE says otherwise", () => {
    expect(engineFromEnv({})).toBe("chromium");
    expect(engineFromEnv({ TDDR_ENGINE: "" })).toBe("chromium");
    expect(engineFromEnv({ TDDR_ENGINE: "firefox" })).toBe("firefox");
    expect(engineFromEnv({ TDDR_ENGINE: "webkit" })).toBe("webkit");
  });

  test("a typo throws instead of running the wrong engine", () => {
    expect(() => engineFromEnv({ TDDR_ENGINE: "safari" })).toThrow(/must be one of chromium, firefox, webkit/);
  });
});
