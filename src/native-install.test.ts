import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const installer = require("../bin/install.cjs") as {
  buildDownloadUrl: (baseUrl: string, archiveName: string) => string;
  downloadWithCurl: (url: string, destPath: string, execFile: (file: string, args: string[]) => void) => void;
  extractArchive: (archivePath: string, destDir: string) => void;
  getBinDir: () => string;
  getExpectedChecksum: (archiveName: string, checksumsPath: string) => string | null;
  requireExpectedChecksum: (archiveName: string, checksumsPath: string) => string;
  getTarget: (platform?: string, arch?: string) => { archiveName: string; binaryName: string } | null;
  install: (baseDir: string, dependencies?: {
    platform?: string;
    arch?: string;
    download?: (url: string, destPath: string, platform: string) => void;
    extractArchive?: (archivePath: string, destDir: string) => void;
  }) => string;
  parseChecksums: (content: string) => Map<string, string>;
  verifyChecksum: (archivePath: string, expectedHash: string | null) => void;
};

let tempRoot: string | undefined;

afterEach(async () => {
  delete process.env.MDD_BINARY_DIR;
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

describe("native binary installer", () => {
  test("maps supported platforms to versioned archive and binary names", () => {
    expect(installer.getTarget("win32", "x64")).toMatchObject({
      archiveName: "mdd-cli-0.3.12-windows-amd64.zip",
      binaryName: "mdd-0.3.12-windows-amd64.exe",
    });
    expect(installer.getTarget("win32", "arm64")).toMatchObject({
      archiveName: "mdd-cli-0.3.12-windows-amd64.zip",
      binaryName: "mdd-0.3.12-windows-amd64.exe",
    });
    expect(installer.getTarget("linux", "arm64")).toMatchObject({
      archiveName: "mdd-cli-0.3.12-linux-arm64.tar.gz",
      binaryName: "mdd-0.3.12-linux-arm64",
    });
    expect(installer.getTarget("freebsd", "x64")).toBeNull();
  });

  test("uses a user-level binary directory and allows explicit override", () => {
    expect(installer.getBinDir()).toContain(join(".mdd", "bin"));
    process.env.MDD_BINARY_DIR = "C:\\mdd-bin";
    expect(installer.getBinDir()).toBe("C:\\mdd-bin");
  });

  test("validates download hosts before invoking curl", () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    installer.downloadWithCurl("https://github.com/yixiaoer888/meidada-cli/releases/download/v1/a.zip", "a.zip", (file, args) => {
      calls.push({ file, args });
    });
    expect(calls[0]?.file).toBe("curl");
    expect(() => installer.downloadWithCurl("https://evil.example/a.zip", "a.zip", () => undefined))
      .toThrow("Download host not allowed");
    expect(installer.buildDownloadUrl("https://example.com/base/", "a.zip")).toBe("https://example.com/base/a.zip");
  });

  test("parses and verifies release asset checksums", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-install-test-"));
    const archivePath = join(tempRoot, "asset.zip");
    await writeFile(archivePath, "asset-content");
    const hash = createHash("sha256").update("asset-content").digest("hex");
    const checksumsPath = join(tempRoot, "checksums.txt");
    await writeFile(checksumsPath, `${hash}  asset.zip\n`);

    expect(installer.parseChecksums(await readFile(checksumsPath, "utf8")).get("asset.zip")).toBe(hash);
    expect(installer.getExpectedChecksum("asset.zip", checksumsPath)).toBe(hash);
    expect(() => installer.verifyChecksum(archivePath, hash)).not.toThrow();
    expect(() => installer.verifyChecksum(archivePath, null)).toThrow("Missing expected checksum");
    expect(() => installer.verifyChecksum(archivePath, "0".repeat(64))).toThrow("Checksum mismatch");
  });

  test("requires checksums.txt and an entry for the current release asset", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-checksum-test-"));
    const checksumsPath = join(tempRoot, "checksums.txt");

    expect(() => installer.requireExpectedChecksum("missing.zip", checksumsPath)).toThrow("Missing checksums.txt");
    await writeFile(checksumsPath, "abc123  other.zip\n");
    expect(() => installer.requireExpectedChecksum("missing.zip", checksumsPath)).toThrow("Missing checksum for release asset: missing.zip");
  });

  test("installs only after checksum verification succeeds", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-install-copy-test-"));
    const packageBinDir = join(tempRoot, "package", "bin");
    const nativeBinDir = join(tempRoot, "native-bin");
    process.env.MDD_BINARY_DIR = nativeBinDir;
    await mkdir(packageBinDir, { recursive: true });

    const target = installer.getTarget(process.platform, process.arch);
    expect(target).not.toBeNull();
    const archiveContent = Buffer.from("archive");
    const hash = createHash("sha256").update(archiveContent).digest("hex");
    await writeFile(join(tempRoot, "package", "checksums.txt"), `${hash}  ${target!.archiveName}\n`);

    const binaryPath = installer.install(packageBinDir, {
      platform: process.platform,
      arch: process.arch,
      download: (_url, destPath) => {
        require("node:fs").writeFileSync(destPath, archiveContent);
      },
      extractArchive: (_archivePath, destDir) => {
        require("node:fs").writeFileSync(join(destDir, target!.binaryName), "binary");
      },
    });

    expect(binaryPath).toBe(join(nativeBinDir, target!.binaryName));
    expect(await readFile(binaryPath, "utf8")).toBe("binary");
  });

  test("extracts an archive containing the versioned binary", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-extract-test-"));
    const extractDir = join(tempRoot, "extract");
    await mkdir(extractDir);
    const binaryName = process.platform === "win32"
      ? "mdd-0.3.12-windows-amd64.exe"
      : "mdd-0.3.12-linux-amd64";
    const archivePath = join(tempRoot, process.platform === "win32" ? "mdd.zip" : "mdd.tar.gz");

    if (process.platform === "win32") {
      const zip = new JSZip();
      zip.file(binaryName, "binary");
      await writeFile(archivePath, await zip.generateAsync({ type: "uint8array" }));
    } else {
      const stagingDir = join(tempRoot, "staging");
      await mkdir(stagingDir);
      await writeFile(join(stagingDir, binaryName), "binary");
      const result = spawnSync("tar", ["-czf", archivePath, "-C", stagingDir, binaryName], { stdio: "ignore" });
      expect(result.status).toBe(0);
    }

    installer.extractArchive(archivePath, extractDir);

    expect(await readFile(join(extractDir, binaryName), "utf8")).toBe("binary");
  });
});
