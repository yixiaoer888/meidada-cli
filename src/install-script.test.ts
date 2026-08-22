import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("npm installation scripts", () => {
  test("use a per-command registry and never change npm config", async () => {
    const [powershell, shell] = await Promise.all([
      readFile(join(root, "install.ps1"), "utf8"),
      readFile(join(root, "install.sh"), "utf8"),
    ]);

    for (const script of [powershell, shell]) {
      expect(script).toContain("registry");
      expect(script).toContain("registry.npmmirror.com");
      expect(script).not.toContain("npm config set");
      expect(script).not.toContain("npm config delete");
    }
  });

  test("provide an official registry fallback and validate Node.js", async () => {
    const [powershell, shell] = await Promise.all([
      readFile(join(root, "install.ps1"), "utf8"),
      readFile(join(root, "install.sh"), "utf8"),
    ]);

    expect(powershell).toContain("[switch]$Official");
    expect(shell).toContain("--official");
    expect(powershell).toContain("Get-Command node");
    expect(shell).toContain("command -v node");
  });

  test("pin this release to CLI 0.5.7", async () => {
    const [powershell, shell] = await Promise.all([
      readFile(join(root, "install.ps1"), "utf8"),
      readFile(join(root, "install.sh"), "utf8"),
    ]);

    expect(powershell).toContain("$expectedVersion = '0.5.7'");
    expect(powershell).toContain("$Version -ne $expectedVersion");
    expect(shell).toContain("EXPECTED_VERSION=0.5.7");
    expect(shell).toContain('[ "$VERSION" != "$EXPECTED_VERSION" ]');
  });

  test("preview destinations and network access before installing", async () => {
    const [powershell, shell] = await Promise.all([
      readFile(join(root, "install.ps1"), "utf8"),
      readFile(join(root, "install.sh"), "utf8"),
    ]);

    for (const script of [powershell, shell]) {
      expect(script).toContain("prefix --global");
      expect(script).toContain("npm 安装目录");
      expect(script).toContain("仅下载当前版本官方二进制并校验 SHA-256");
      expect(script).toContain("普通用户终端执行");
    }
  });

  test("do not bypass the PowerShell execution policy", async () => {
    const installer = await readFile(join(root, "bin", "install.cjs"), "utf8");
    expect(installer).not.toContain("ExecutionPolicy");
    expect(installer).not.toContain("Bypass");
    expect(installer).toContain("-NonInteractive");
  });
});
