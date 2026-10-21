import { expect, it } from "vitest";
import { run, type CliIO } from "../../../src/cli.ts";

it("exits 2 with the message for an unknown target", async () => {
  const err: string[] = [];
  const io: CliIO = {
    stdout: () => {},
    stderr: (s) => void err.push(s),
    readFile: () => "<p>hi</p>",
    writeFile: () => {},
  };
  expect(await run(["build", "in.html", "--targets", "nope"], io)).toBe(2);
  expect(err.join("")).toContain('Unknown target "nope". Known:');
});
