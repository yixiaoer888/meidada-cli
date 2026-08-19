import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

describe("package directory builder", () => {
  test("builds a lightweight npm package from release asset checksums", async () => {
    const assetChecksums = "abc123  mdd-cli-0.4.4-windows-amd64.zip\n";
    await mkdir(join(process.cwd(), "out", "assets"), { recursive: true });
    await writeFile(join(process.cwd(), "out", "assets", "checksums.txt"), assetChecksums);

    const result = spawnSync(process.execPath, ["scripts/build-package-dir.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "out", "package", "package.json"), "utf8"));
    expect(packageJson.scripts).toEqual({ postinstall: "node bin/postinstall.cjs" });
    expect(packageJson.files).toContain("checksums.txt");
    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.devDependencies).toBeUndefined();
    expect(await readFile(join(process.cwd(), "out", "package", "checksums.txt"), "utf8")).toBe(assetChecksums);
  }, 15_000);
});
