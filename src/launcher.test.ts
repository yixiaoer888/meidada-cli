import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

describe("npm launcher", () => {
  test("attempts native install when the current platform binary is missing", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-launcher-test-"));
    const result = spawnSync(process.execPath, ["bin/mdd.js", "version", "--json"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MDD_BINARY_DIR: tempRoot,
        MDD_DOWNLOAD_BASE_URL: "not a url",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"code":"missing_binary"');
    expect(result.stderr).toContain("Automatic install failed");
  });
});
