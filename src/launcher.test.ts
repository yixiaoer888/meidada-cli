import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_VERSION } from "./version";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

describe("npm launcher", () => {
  test("downloads only the current binary when the platform package is missing", async () => {
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
    expect(result.stderr).toContain('"code":"binary_download_failed"');
    expect(result.stderr).toContain(`自动下载 CLI ${CLI_VERSION} 二进制失败`);
    expect(result.stderr).toContain(`npm install -g @meidada-cn/cli@${CLI_VERSION}`);
    expect(result.stderr).not.toContain("0.4.4");
  });
});
