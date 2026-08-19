import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

describe("release tag check", () => {
  test("passes only when the git tag matches package.json version", () => {
    const ok = spawnSync("bun", ["scripts/check-release-tag.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, GITHUB_REF_NAME: "v0.4.3" },
      encoding: "utf8",
    });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("Release tag check passed: v0.4.3");

    const mismatch = spawnSync("bun", ["scripts/check-release-tag.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, GITHUB_REF_NAME: "v0.4.3-pre.1" },
      encoding: "utf8",
    });
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain("Git tag 与 package.json 版本不一致");
  });
});
